import "./index.html?copy";

import Camera from "./Controls/Camera.mjs";
import KeyboardControls from "./Controls/KeyboardControls.mjs";
import MouseControls from "./Controls/MouseControls.mjs";
import GenerateWorld from "./Scenes/Scenes/Mountains/Generate.mjs";
import Renderer from "./Voxels/Raytraced_8_AABB/Renderer.mjs";
import StatisticsWindow from "./StatisticsWindow/StatisticsWindow.mjs";

window.addEventListener("load", function(){
  self.Main = new Main;
});

class Main{
  constructor(){
    const OverlayElement = document.getElementById("Overlay");
    this.Camera = new Camera;
    this.KeyboardControls = new KeyboardControls(this.Camera, OverlayElement);
    this.MouseControls = new MouseControls(this.Camera, OverlayElement);
    console.time();
    this.Data = GenerateWorld();
    console.timeEnd();
    void async function(){
      this.StatisticsWindow = new StatisticsWindow;
      this.Renderer = await (new Renderer).Initialise(this.Data.Buffer, this.Data.Size, this.Camera, this.StatisticsWindow);

      void function Load(){
        window.requestAnimationFrame(Load.bind(this));
        this.Renderer.Render();
      }.call(this);
    }.call(this);
  }
}