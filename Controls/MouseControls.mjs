import {AddEventListener, RemoveEventListener} from "../Libraries/Events.mjs";

export default class MouseControls{
  constructor(Camera, MouseElement){
    this.Camera = Camera;
    this.MouseElement = MouseElement;
    this.InvertY = true;
    this.IsPointerLocked = false;
    this.MouseSensitivity = 2.;

    this.HandleClickID = AddEventListener(this.MouseElement, "click", this.HandleClick.bind(this));
    this.HandlePointerLockChangeID = AddEventListener(document, "pointerlockchange", this.HandlePointerLockChange.bind(this));
    this.HandleKeyDownID = AddEventListener(document, "keydown", this.HandleKeyDown.bind(this));
    this.HandleMouseMoveID = AddEventListener(document, "mousemove", this.HandleMouseMove.bind(this));
  }
  HandleKeyDown(Event){
    switch(Event.code){
      case "AltLeft":
      case "Escape":{
        if(this.IsPointerLocked) document.exitPointerLock(), this.MouseElement.blur();
        return;
      }
    }
  }
  HandleClick(Event){
    this.MouseElement.requestPointerLock();
    this.IsPointerLocked = this.MouseElement === document.pointerLockElement;
    if(this.IsPointerLocked) this.MouseElement.focus();
    else this.MouseElement.blur();
  }
  HandlePointerLockChange(Event){
    this.IsPointerLocked = this.MouseElement === document.pointerLockElement;
    if(this.IsPointerLocked) this.MouseElement.focus();
    else this.MouseElement.blur();
  }
  HandleMouseMove(Event){
    if(!this.IsPointerLocked) return;
    this.Camera.RotationX += Event.movementX / 1000. * this.MouseSensitivity;
    this.Camera.RotationY += Event.movementY / 1000. * (this.InvertY ? -1. : 1.) * this.MouseSensitivity;
  }
  Destroy(){
    if(this.IsPointerLocked) document.exitPointerLock(), this.MouseElement.blur();
    RemoveEventListener(this.HandleClickID);
    RemoveEventListener(this.HandlePointerLockChangeID);
    RemoveEventListener(this.HandleKeyDownID);
    RemoveEventListener(this.HandleMouseMoveID);
  }
};