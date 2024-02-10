import * as mat4 from "../Libraries/GLMatrix/mat4.mjs";
export default class Camera{
  constructor(){
    this.PositionX = 0.;
    this.PositionY = 0.;
    this.PositionZ = 0.;
    this.RotationX = 0.;
    this.RotationY = 0.;
    this.FOV = 100.;
    this.Near = 2.;
    this.Far = 8192.;
  }
  GetProjectionMatrix(AspectRatio){
    const ProjectionMatrix = mat4.create();
    mat4.perspectiveZO(ProjectionMatrix, (this.FOV * Math.PI) / 180., AspectRatio, this.Near, this.Far);
    return ProjectionMatrix;
  }
  GetModelViewMatrix(){
    const ModelViewMatrix = mat4.create();
    mat4.rotateX(ModelViewMatrix, ModelViewMatrix, this.RotationY);
    mat4.rotateY(ModelViewMatrix, ModelViewMatrix, this.RotationX);
    mat4.translate(ModelViewMatrix, ModelViewMatrix, [-this.PositionX, -this.PositionY, -this.PositionZ]);

    return ModelViewMatrix;
  }
  GetModelViewProjectionMatrix(AspectRatio){
    const ModelViewProjectionMatrix = mat4.create();
    mat4.mul(ModelViewProjectionMatrix, this.GetProjectionMatrix(AspectRatio), this.GetModelViewMatrix());
    return ModelViewProjectionMatrix;
  }
};