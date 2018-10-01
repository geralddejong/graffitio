import {Raycaster, Vector3} from 'three';
import {Gotch, gotchTreeString} from './gotch';
import {ADJACENT, BRANCH_STEP, GOTCH_SHAPE, STOP_STEP} from './shapes';
import {coordSort, equals, ICoords, plus, Spot, spotsToString, zero} from './spot';
import {IFabricFactory} from '../body/fabric';
import {Genome, IGenomeData} from '../genetics/genome';

export interface IslandPattern {
    gotches: string;
    spots: string;
    genomes: Map<string, IGenomeData>;
}

const sortSpotsOnCoord = (a: Spot, b: Spot): number => coordSort(a.coords, b.coords);
const gotchWithMaxNonce = (gotches: Gotch[]) => gotches.reduce((withMax, adjacent) => {
    if (withMax) {
        return adjacent.nonce > withMax.nonce ? adjacent : withMax;
    } else {
        return adjacent;
    }
});

export class Island {
    public spots: Spot[] = [];
    public gotches: Gotch[] = [];
    public facesMeshNode: any;
    public genomeData: Map<string, IGenomeData>;

    constructor(public islandName: string, private fabricFactory: IFabricFactory) {
        const patternString = localStorage.getItem(islandName);
        const pattern: IslandPattern = patternString ? JSON.parse(patternString) : {
            gotches: '',
            spots: '',
            genomes: new Map<string, IGenomeData>()
        };
        this.genomeData = pattern.genomes;
        this.apply(pattern);
        console.log(`Loaded ${this.islandName}`);
        this.refresh();
    }

    public get legal(): boolean {
        return !this.spots.find(spot => !spot.legal);
    }

    public refresh() {
        this.spots.forEach(spot => {
            spot.adjacentSpots = this.getAdjacentSpots(spot);
            spot.connected = spot.adjacentSpots.length < 6;
        });
        let flowChanged = true;
        while (flowChanged) {
            flowChanged = false;
            this.spots.forEach(spot => {
                if (!spot.connected) {
                    const connectedByAdjacent = spot.adjacentSpots.find(adj => (adj.land === spot.land) && adj.connected);
                    if (connectedByAdjacent) {
                        spot.connected = true;
                        flowChanged = true;
                    }
                }
            });
        }
        this.spots.forEach(spot => spot.refresh());
    }

    public save() {
        localStorage.setItem(this.islandName, JSON.stringify(this.pattern));
        console.log(`Saved ${this.islandName}`);
    }

    public findGotch(master: string): Gotch | undefined {
        return this.gotches.find(gotch => !!gotch.gotchi && gotch.gotchi.master === master)
    }

    public get singleGotch(): Gotch | undefined {
        return this.gotches.length === 1 ? this.gotches[0] : undefined;
    }

    public get midpoint(): Vector3 {
        return this.spots
            .reduce(
                (sum: Vector3, spot: Spot) => {
                    sum.x += spot.scaledCoords.x;
                    sum.z += spot.scaledCoords.y;
                    return sum;
                },
                new Vector3()
            )
            .multiplyScalar(1 / this.spots.length);
    }

    public findSpot(raycaster: Raycaster): Spot | undefined {
        const intersections = raycaster.intersectObject(this.facesMeshNode);
        if (intersections.length && intersections[0].faceIndex) {
            const hit = intersections[0].faceIndex;
            return hit ? this.spots.find(spot => spot.faceIndexes.indexOf(hit) >= 0) : undefined;
        }
        return undefined;
    }

    public get pattern(): IslandPattern | undefined {
        if (!this.genomeData || this.spots.find(spot => !spot.legal)) {
            return undefined;
        }
        const genomes = new Map<string, Genome>();
        this.gotches.forEach(gotch => {
            if (gotch.genome) {
                genomes[gotch.createFingerprint()] = gotch.genome;
            }
        });
        return {
            gotches: gotchTreeString(this.gotches),
            spots: spotsToString(this.spots),
            genomes: this.genomeData
        } as IslandPattern;
    }

    // ================================================================================================

    private apply(pattern: IslandPattern) {
        let gotch: Gotch | undefined = this.getOrCreateGotch(undefined, zero);
        const stepStack = pattern.gotches.split('').reverse().map(stepChar => Number(stepChar));
        const gotchStack: Gotch[] = [];
        while (stepStack.length > 0) {
            const step = stepStack.pop();
            switch (step) {
                case STOP_STEP:
                    gotch = gotchStack.pop();
                    break;
                case BRANCH_STEP:
                    if (gotch) {
                        gotchStack.push(gotch);
                    }
                    break;
                case 1:
                case 2:
                case 3:
                case 4:
                case 5:
                case 6:
                    if (gotch) {
                        gotch = this.gotchAroundSpot(gotch.spots[step]);
                    }
                    break;
                default:
                    console.error('Error step');
            }
        }
        const hexChars = pattern.spots ? pattern.spots.split('') : [];
        const numbers = hexChars.map(hexChar => parseInt(hexChar, 16));
        const booleanArrays = numbers.map(nyb => {
            const b0 = (nyb & 8) !== 0;
            const b1 = (nyb & 4) !== 0;
            const b2 = (nyb & 2) !== 0;
            const b3 = (nyb & 1) !== 0;
            return [b0, b1, b2, b3];
        });
        const landStack = [].concat.apply([], booleanArrays).reverse();
        this.spots.sort(sortSpotsOnCoord);
        if (landStack.length) {
            this.spots.forEach(spot => {
                const land = landStack.pop();
                spot.land = land ? land : false;
            });
        } else if (this.singleGotch) {
            this.singleGotch.spots[0].land = true;
        }
        this.gotches.forEach(g => g.genome = new Genome(this.genomeData[g.createFingerprint()]));
        this.refresh();
    }

    private gotchAroundSpot(spot: Spot): Gotch {
        const adjacentMaxNonce = gotchWithMaxNonce(spot.adjacentGotches);
        return this.getOrCreateGotch(adjacentMaxNonce, spot.coords);
    }

    private getOrCreateGotch(parent: Gotch | undefined, coords: ICoords): Gotch {
        const existing = this.gotches.find(existingGotch => equals(existingGotch.coords, coords));
        if (existing) {
            return existing;
        }
        const spots = GOTCH_SHAPE.map(c => this.getOrCreateSpot(plus(c, coords)));
        const gotch = new Gotch(this.fabricFactory, parent, coords, spots);
        this.gotches.push(gotch);
        return gotch;
    }

    private getOrCreateSpot(coords: ICoords): Spot {
        const existing = this.getSpot(coords);
        if (existing) {
            return existing;
        }
        const spot = new Spot(coords);
        this.spots.push(spot);
        return spot;
    }

    private getAdjacentSpots(spot: Spot): Spot[] {
        const adjacentSpots: Spot[] = [];
        const coords = spot.coords;
        ADJACENT.forEach(a => {
            const adjacentSpot = this.getSpot(plus(a, coords));
            if (adjacentSpot) {
                adjacentSpots.push(adjacentSpot);
            }
        });
        return adjacentSpots;
    }

    private getSpot(coords: ICoords): Spot | undefined {
        return this.spots.find(p => equals(p.coords, coords));
    }
}