import HTML from "./Switch.html";
import CSS from "./Switch.css";
import {AddEventListener, FireEvent} from "../../Libraries/Events.mjs";
export default class Slider{
  constructor({
    Name = "Switch",
    DefaultValue = false,
    Disabled = false
  }){
    [this.Element, this.ID] = HTML("Switch");
    CSS("Switch");
    this.Events = new EventTarget;
    this.DefaultValue = DefaultValue;
    this.Disabled = Disabled;
    this.SetDisabled(this.Disabled);

    this.NameElement = this.Element.querySelector(`#${this.ID}-Name`);
    this.SwitchElement = this.Element.querySelector(`#${this.ID}-SwitchInput`);
    this.NameElement.textContent = Name;

    AddEventListener(this.SwitchElement, "input", function(){
      this.SetValue(this.SwitchElement.checked);
    }.bind(this));
    AddEventListener(this.Element, "mousedown", function(Event){
      if(Event.button !== 2) return;
      this.SetDisabled(!this.Disabled);
    }.bind(this));
  }
  Initialise(){
    this.SetValue(this.DefaultValue);
    return this;
  }
  SetValue(Value){
    this.SwitchElement.checked = Value;
    FireEvent(this.Events, new CustomEvent("Change"));
  }
  GetValue(){
    return this.SwitchElement.checked;
  }
  SetDisabled(Status){
    this.Disabled = Status;
    if(this.Disabled){
      if(!this.Element.classList.contains("Switch-Disabled")) this.Element.classList.add("Switch-Disabled");
    } else{
      if(this.Element.classList.contains("Switch-Disabled")) this.Element.classList.remove("Switch-Disabled");
    }
    FireEvent(this.Events, new CustomEvent("Change"));
  }
};