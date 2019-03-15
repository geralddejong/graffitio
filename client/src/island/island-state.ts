import {BehaviorSubject} from "rxjs"
import {Vector3} from "three"

import {AppStorage} from "../app-storage"
import {freshGenome} from "../genetics/genome"
import {Evolution} from "../gotchi/evolution"
import {Gotchi} from "../gotchi/gotchi"

import {Hexalot} from "./hexalot"
import {Island} from "./island"
import {IslandStateClick} from "./island-state-click"
import {IslandStateCommand} from "./island-state-command"
import {Journey} from "./journey"
import {Spot, Surface} from "./spot"

export enum Command {
    ClaimHexalot = "Claim hexalot",
    ComeHere = "Come here",
    DriveFree = "Drive free",
    DriveJourney = "Drive journey",
    Evolve = "Evolve",
    ForgetJourney = "Forget journey",
    GoThere = "Go there",
    Logout = "Logout",
    MakeLand = "Make into land",
    MakeWater = "Make into water",
    PlanFreeDrive = "Plan free drive",
    PlanJourney = "Plan journey",
    RandomGenome = "Random genome",
    ReturnHome = "Return home",
    JumpToFix = "Jump to fix",
    AbandonFix = "Abandon fix",
    RotateLeft = "Rotate left",
    RotateRight = "Rotate right",
    SaveGenome = "Save genome",
    StopMoving = "Stop moving",
}

export enum IslandMode {
    DrivingFree = "Driving free",
    DrivingJourney = "Driving journey",
    Evolving = "Evolving",
    FixingIsland = "Fixing island",
    Landed = "Landed",
    PlanningDrive = "Planning drive",
    PlanningJourney = "Planning journey",
    Visiting = "Visiting",
}

export class IslandState {
    public subject: BehaviorSubject<IslandState>

    constructor(
        readonly island: Island,
        readonly storage: AppStorage,
        public islandMode: IslandMode,
        public legal: boolean = false,
        public homeHexalot?: Hexalot,
        public selectedSpot?: Spot,
        public selectedHexalot?: Hexalot,
        public gotchi?: Gotchi,
        public evolution?: Evolution,
        public journey?: Journey,
    ) {
    }

    public stateAfterCommand(command: Command, location: Vector3): IslandState {
        return new IslandStateCommand(this).stateAfterCommand(command, location)
    }

    public stateAfterClick(spot: Spot): IslandState {
        return new IslandStateClick(this).stateAfterClick(spot)
    }

    public withMode(islandMode: IslandMode): IslandState {
        const copy = this.copy
        copy.islandMode = islandMode
        switch (islandMode) {
            case IslandMode.FixingIsland:
            case IslandMode.Visiting:
            case IslandMode.Landed:
            case IslandMode.PlanningJourney:
            case IslandMode.PlanningDrive:
                copy.recycle()
                break
        }
        return copy
    }

    public withNewHexalotAt(spot: Spot): IslandState {
        const copy = this.copy
        this.island.createHexalot(spot)
        return copy.withSelectedSpot(spot).withRestructure()
    }

    public withRestructure(): IslandState {
        const island = this.island
        const legal = this.island.refreshStructureLegal()
        const hexalots = island.hexalots
        const spots = island.spots
        const singleHexalot = hexalots.length === 1
        const homeHexalot = this.homeHexalot
        if (homeHexalot) {
            spots.forEach(spot => spot.available = false)
        } else {
            spots.forEach(spot => spot.checkAvailable(singleHexalot, legal))
        }
        spots.forEach(spot => spot.checkFree(singleHexalot))
        hexalots.forEach(hexalot => hexalot.refreshFingerprint())
        const copy = this.withLegal(legal)
        if (!legal) {
            return copy.withMode(IslandMode.FixingIsland)
        }
        if (singleHexalot) {
            const firstHexalot = hexalots[0]
            const centerSpot = firstHexalot.centerSpot
            if (!firstHexalot.occupied) {
                centerSpot.available = legal
            }
            return copy.homeHexalot ? this.withSelectedSpot(centerSpot) : this
        }
        if (homeHexalot) {
            if (!homeHexalot.occupied) {
                this.storage.setGenome(homeHexalot, freshGenome().genomeData)
            }
            return copy.withSelectedSpot(homeHexalot.centerSpot).withHomeHexalot(homeHexalot)
        }
        return copy.withMode(IslandMode.Visiting)
    }

    public withJourney(homeHexalot: Hexalot, journey?: Journey): IslandState {
        const copy = this.copy
        homeHexalot.journey = this.journey = journey
        this.storage.saveJourney(homeHexalot)
        return copy
    }

    public withSelectedSpot(selectedSpot?: Spot): IslandState {
        const copy = this.copy
        copy.selectedSpot = selectedSpot
        copy.selectedHexalot = selectedSpot ? selectedSpot.centerOfHexalot : undefined
        return copy
    }

    public withSurface(surface: Surface): IslandState {
        const selectedSpot = this.selectedSpot
        if (!selectedSpot) {
            return this
        }
        selectedSpot.surface = surface
        const copy = this.copy
        const nextFree = selectedSpot.adjacentSpots.find(s => s.free && s.surface === Surface.Unknown)
        if (nextFree) {
            return copy.withSelectedSpot(nextFree)
        }
        const hexalot = selectedSpot.memberOfHexalot.length === 1 ? selectedSpot.memberOfHexalot[0] : undefined
        if (hexalot) {
            const selected = copy.withSelectedSpot(hexalot.centerSpot)
            if (this.legal && !hexalot.occupied) {
                hexalot.genome = freshGenome()
            }
            return hexalot.occupied ? selected.withHomeHexalot(hexalot) : selected.withMode(IslandMode.Visiting)
        }
        return copy
    }

    public withGotchi(gotchi: Gotchi, journey?: Journey): IslandState {
        this.recycle()
        const copy = this.copy
        copy.gotchi = gotchi
        copy.islandMode = journey ? IslandMode.DrivingJourney : IslandMode.DrivingFree
        copy.journey = journey
        return copy
    }

    public withEvolution(evolution: Evolution): IslandState {
        this.recycle()
        const copy = this.copy
        copy.evolution = evolution
        copy.islandMode = IslandMode.Evolving
        return copy
    }

    public withLegal(legal: boolean): IslandState {
        const copy = this.copy
        copy.legal = legal
        return copy
    }

    public dispatch(): void {
        this.island.state = this
        this.subject.next(this)
    }

    public get withFreeHexalotsRemoved(): IslandState {
        this.island.removeFreeHexalots()
        return this // todo: no change of state?
    }

    public withHomeHexalot(hexalot?: Hexalot): IslandState {
        const copy = this.copy.withSelectedSpot(hexalot ? hexalot.centerSpot : undefined)
        copy.homeHexalot = hexalot
        copy.islandMode = copy.homeHexalot ? IslandMode.Landed : IslandMode.Visiting
        return copy
    }

    public recycle(): void {
        if (this.gotchi) {
            this.gotchi.recycle()
            this.gotchi = undefined
        }
        if (this.evolution) {
            this.evolution.recycle()
            this.evolution = undefined
        }
    }

    private get copy(): IslandState {
        const ditto = new IslandState(
            this.island,
            this.storage,
            this.islandMode,
            this.legal,
            this.homeHexalot,
            this.selectedSpot,
            this.selectedHexalot,
            this.gotchi,
            this.evolution,
            this.journey,
        )
        ditto.subject = this.subject
        return ditto
    }
}
