import HTML from "./index.html";
import CSS from "./style.css";
import WindowFrame from "../Libraries/WindowFrame/WindowFrame.mjs";
import SVGGraph from "../Libraries/SVGGraph/SVGGraph.mjs";
import {AddEventListener, RemoveEventListener} from "../Libraries/Events.mjs";

export default class StatisticsWindow{
  constructor(){
    [this.Element, this.ID] = HTML("StatisticsWindow");
    CSS("StatisticsWindow");
    this.IsDestroyed = false;
    this.Frame = new WindowFrame(600, 400, false);
    this.Frame.SetTitle("Statistics");
    this.Frame.SetBody(this.Element);

    this.CloseEventID = AddEventListener(this.Frame.Events, "Close", function(){
      this.Destroy();
    }.bind(this));

    this.GraphSection = this.Element.querySelector(`#${this.ID}-Graphs`);
    this.Graphs = new Map;
  }
  AddGraph(ID, Properties){
    if(this.IsDestroyed) return console.error("Statistics window is destroyed.");
    const Graph = new SVGGraph(Properties);
    this.Graphs.set(ID, Graph);
    
    //I need to use setTimeout because otherwise the IntersectionObserver may not work
    window.setTimeout(async function(){
      this.GraphSection.appendChild(Graph.Element);
    }.bind(this));
  }
  Update(ID, Value){
    if(this.IsDestroyed) return console.error("Statistics window is destroyed.");
    if(!this.Graphs.has(ID)) return console.error(`Graph with ID ${ID} does not exist.`);
    this.Graphs.get(ID).AddDataPoint(Value);
  }
  Destroy(){
    this.IsDestroyed = true;
    RemoveEventListener(this.CloseEventID);
    for(const Graph of this.Graphs){
      Graph.Destroy();
    }
  }
};