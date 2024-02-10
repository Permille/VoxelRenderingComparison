import * as mat4 from "../Libraries/GLMatrix/mat4.mjs";
export default class Camera{
  constructor(){
    this.PositionX = 0.;
    this.PositionY = 0.;
    this.PositionZ = 0.;
    this.RotationX = 0.;
    this.RotationY = 0.;
    this.FOV = 100.;
  }
};