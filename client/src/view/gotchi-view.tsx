import * as React from 'react';
import * as R3 from 'react-three';
import {Color, PerspectiveCamera, Vector3} from 'three';
import {clearFittest, Population} from '../gotchi/population';
import {Gotchi} from '../gotchi/gotchi';
import {Island} from '../island/island';
import {PopulationComponent} from './population-component';
import {PopulationFrontier} from './population-frontier';
import {IslandComponent} from './island-component';
import {Orbit} from './orbit';
import {GOTCHI_GHOST_MATERIAL} from './materials';
import {GotchiComponent} from './gotchi-component';
import {SpotSelector} from './spot-selector';
import {Spot} from '../island/spot';
import {HUNG_ALTITUDE, NORMAL_TICKS} from '../body/fabric';

interface IGotchiViewProps {
    width: number;
    height: number;
    population: Population;
    island: Island;
    master: string;
}

interface IGotchiViewState {
    cameraTooFar: boolean;
    selectedGotchi?: Gotchi;
}

// const SPRING_MATERIAL = new LineBasicMaterial({vertexColors: VertexColors}); // todo: if this doesn't get used, remove it from WA
const SUN_POSITION = new Vector3(0, 300, 0);
const CAMERA_POSITION = new Vector3(9, HUNG_ALTITUDE / 2, 8);
const TARGET_FRAME_RATE = 25;

export class GotchiView extends React.Component<IGotchiViewProps, IGotchiViewState> {
    private perspectiveCamera: PerspectiveCamera;
    private orbit: Orbit;
    private selector: SpotSelector;
    private frameTime = Date.now();
    private frameCount = 0;
    private frameDelay = 20;
    private animating = true;

    constructor(props: IGotchiViewProps) {
        super(props);
        this.state = {
            cameraTooFar: false
        };
        // const loader = new TextureLoader();
        // this.floorMaterial = new MeshBasicMaterial({map: loader.load('/grass.jpg')});
        this.perspectiveCamera = new PerspectiveCamera(50, this.props.width / this.props.height, 1, 500000);
        this.perspectiveCamera.position.add(CAMERA_POSITION);
        window.addEventListener("keypress", (event: KeyboardEvent) => {
            switch (event.code) {
                case 'KeyM':
                    this.props.population.forDisplay.forEach((gotchi, index) => {
                        console.log(`${index}: ${gotchi.distance}`, gotchi.fabric.midpoint);
                    });
                    break;
                case 'KeyS':

                    this.props.population.forDisplay.forEach((gotchi, index) => {
                        console.log(`${index}: ${gotchi.distance}`, gotchi.fabric.midpoint);
                    });
                    break;
                case 'KeyR':
                    clearFittest();
                    break;
            }
        });
    }

    public componentDidUpdate(prevProps: Readonly<IGotchiViewProps>, prevState: Readonly<IGotchiViewState>, snapshot: any) {
        if (prevProps.width !== this.props.width || prevProps.height !== this.props.height) {
            this.perspectiveCamera.aspect = this.props.width / this.props.height;
            this.perspectiveCamera.updateProjectionMatrix();
        }
    }

    public componentDidMount() {
        this.orbit = new Orbit(document.getElementById('gotchi-view'), this.perspectiveCamera);
        this.selector = new SpotSelector(
            this.props.island,
            this.perspectiveCamera,
            this.props.width,
            this.props.height
        );
        this.animate();
    }

    public componentWillUnmount() {
        this.animating = false;
    }

    public render() {
        this.frameCount++;
        if (this.frameCount === 300) {
            const frameTime = Date.now();
            const framesPerSecond = 1000 / ((frameTime - this.frameTime) / this.frameCount);
            this.frameTime = frameTime;
            this.frameCount = 0;
            if (framesPerSecond > TARGET_FRAME_RATE) {
                this.frameDelay++;
            } else if (framesPerSecond < TARGET_FRAME_RATE) {
                this.frameDelay /= 2;
            }
            console.log(`FPS: ${Math.floor(framesPerSecond)}: ${this.frameDelay}`);
        }
        return (
            <div id="gotchi-view" onMouseDownCapture={e => this.spotClicked(this.selector.getSpot(e))}>
                <R3.Renderer width={this.props.width} height={this.props.height}>
                    <R3.Scene width={this.props.width} height={this.props.height} camera={this.perspectiveCamera}>
                        <IslandComponent island={this.props.island} master={this.props.master}/>
                        {
                            this.state.selectedGotchi
                                ? <GotchiComponent gotchi={this.state.selectedGotchi}/>
                                : <PopulationComponent population={this.props.population}/>
                        }
                        <PopulationFrontier frontier={this.props.population.frontier}/>
                        {
                            this.props.island.gotches
                                .filter((gotch, index) => !!gotch.gotchi && index > 0)
                                .map(gotch => gotch.gotchi)
                                .map((gotchi: Gotchi, index: number) => {
                                    return <R3.Mesh
                                        ref={(node: any) => gotchi.facesMeshNode = node}
                                        key={`Faces${index}`}
                                        geometry={gotchi.fabric.facesGeometry}
                                        material={GOTCHI_GHOST_MATERIAL}
                                    />
                                })
                        }
                        <R3.PointLight key="Sun" distance="1000" decay="0.01" position={SUN_POSITION}/>
                        <R3.HemisphereLight name="Hemi" color={new Color(0.8, 0.8, 0.8)}/>
                    </R3.Scene>
                </R3.Renderer>
            </div>
        );
    }

    // ==========================

    private spotClicked(spot?: Spot) {
        if (this.state.cameraTooFar && spot && spot.centerOfGotch) {
            const gotch = spot.centerOfGotch;
            gotch.triggerBirth();
        }
    }

    private animate() {
        const step = () => {
            setTimeout(
                () => {
                    if (this.state.cameraTooFar) {
                        this.orbit.moveTargetTowards(this.props.island.midpoint);
                    } else {
                        const single = this.state.selectedGotchi;
                        if (single) {
                            single.iterate(NORMAL_TICKS);
                            this.orbit.moveTargetTowards(single.fabric.midpoint);
                        } else {
                            this.props.population.iterate();
                            this.orbit.moveTargetTowards(this.props.population.midpoint);
                            // todo: this is escape-of-the-fittest, remove it
                            // if (this.props.population.fittest) {
                            //     this.setState({selectedGotchi: this.props.population.fittest});
                            //     this.props.population.fittest = undefined;
                            // }
                        }
                    }
                    if (this.animating) {
                        this.forceUpdate();
                        this.orbit.update();
                        if (this.orbit.tooFar !== this.state.cameraTooFar) {
                            this.setState({cameraTooFar: this.orbit.tooFar});
                        }
                        requestAnimationFrame(step);
                    }
                },
                this.frameDelay
            );
        };
        requestAnimationFrame(step);
    }
}

