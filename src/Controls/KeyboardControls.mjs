import {AddEventListener, RemoveEventListener} from "../Libraries/Events.mjs";

export default class KeyboardControls{
  constructor(Camera, Element = document){
    this.Camera = Camera;
    this.Element = Element;
    this.Element.setAttribute("tabindex", "-1");
    this.MovementSpeed = 1.;
    this.PressedKeys = new Map;
    this.IsDestroyed = false;

    //For keydown, the element is used, but for keyup, the global document is used. This is intentional.
    //That is because I only want to start moving when I'm focused, but I can stop moving whenever needed (even when not focused)
    this.HandleKeyDownID = AddEventListener(this.Element, "keydown", this.HandleKeyDown.bind(this));
    this.HandleKeyUpID = AddEventListener(document, "keyup", this.HandleKeyUp.bind(this));

    this.SmoothMovement = true;
    
    this.VelocityX = 0.;
    this.VelocityY = 0.;
    this.VelocityZ = 0.;

    this.LastUpdate = window.performance.now();
    void function Load(){
      if(this.IsDestroyed) return;
      window.requestAnimationFrame(Load.bind(this));

      const Now = window.performance.now();
      const Difference = Now - this.LastUpdate;
      this.LastUpdate = Now;

      const MovementX = this.IsPressed("KeyS") - this.IsPressed("KeyW");
      const MovementZ = this.IsPressed("KeyD") - this.IsPressed("KeyA");
      const MovementY = this.IsPressed("Space") - this.IsPressed("ShiftLeft");

      const CurrentMovementX = (-Math.sin(this.Camera.RotationX) * MovementX + Math.cos(this.Camera.RotationX) * MovementZ);
      const CurrentMovementY = MovementY;
      const CurrentMovementZ = (Math.cos(this.Camera.RotationX) * MovementX + Math.sin(this.Camera.RotationX) * MovementZ);

      this.VelocityX = this.VelocityX * .95 + .05 * this.MovementSpeed * CurrentMovementX;
      this.VelocityY = this.VelocityY * .95 + .05 * this.MovementSpeed * CurrentMovementY;
      this.VelocityZ = this.VelocityZ * .95 + .05 * this.MovementSpeed * CurrentMovementZ;

      if(this.SmoothMovement){
        this.Camera.PositionX += this.VelocityX * Difference;
        this.Camera.PositionY += this.VelocityY * Difference;
        this.Camera.PositionZ += this.VelocityZ * Difference;
      } else{
        this.Camera.PositionX += this.MovementSpeed * Difference * CurrentMovementX;
        this.Camera.PositionY += this.MovementSpeed * Difference * CurrentMovementY;
        this.Camera.PositionZ += this.MovementSpeed * Difference * CurrentMovementZ;
      }

      //Clamp camera position to within the bounds of the world
      this.Camera.PositionX = Math.min(4095.875, Math.max(0.125, this.Camera.PositionX));
      this.Camera.PositionY = Math.min(4095.875, Math.max(0.125, this.Camera.PositionY));
      this.Camera.PositionZ = Math.min(4095.875, Math.max(0.125, this.Camera.PositionZ));
    }.bind(this)();
  }
  SetSmoothMovement(Value){
    this.SmoothMovement = Value;
  }
  IsPressed(Key){
    return this.PressedKeys.get(Key) ?? false;
  }
  HandleKeyDown(Event){
    this.PressedKeys.set(Event.code, true);
  }
  HandleKeyUp(Event){
    this.PressedKeys.set(Event.code, false);
  }
  Destroy(){
    this.IsDestroyed = true;
    RemoveEventListener(this.HandleKeyDownID);
    RemoveEventListener(this.HandleKeyUpID);
  }
};