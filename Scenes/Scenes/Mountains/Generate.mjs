// Heightmap function is ported from the original shader on: https://www.shadertoy.com/view/MtGcWh
// Original author: Clay John (Copyright 2020 Clay John)
// MIT Licence by Clay John

function smoothstep(a, b, x){
  const t = Math.min(Math.max((x - a) / (b - a), 0.), 1.);
  return t * t * (3. - 2. * t);
}

function fract(x){
  return x - Math.floor(x);
}

const EROSION_TILES = 4.;
const EROSION_OCTAVES = 4;
const EROSION_GAIN = .5;
const EROSION_LACUNARITY = 2.;
const EROSION_SLOPE_STRENGTH = 3.;
const EROSION_BRANCH_STRENGTH = 3.;
const EROSION_STRENGTH = 3e-2;

const HEIGHT_TILES = 3.0;
const HEIGHT_OCTAVES = 3;
const HEIGHT_AMP = 0.25;
const HEIGHT_GAIN = 0.1;
const HEIGHT_LACUNARITY = 2.0;

const WATER_HEIGHT = .44;


function FastCos(x){
  x *= 1. / (2. * Math.PI);
  x -= .25 + Math.floor(x + .25);
  x *= 16. * (Math.abs(x) - .5);
  return x;
}
function Hash(px, py){
  let p3x = fract(px * .1031);
  let p3y = fract(py * .1031);
  let p3z = fract(px * .1031);

  let Dot = p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33);
  
  p3x += Dot;
  p3y += Dot;
  p3z += Dot;
  
  let h = fract((p3x + p3y) * p3z);

  const a = Math.PI * 2 * h;
  return [FastCos(a), FastCos(a - 1.57)];
}

function noised(px, py){
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = fract(px);
  const fy = fract(py);

  const ux = fx*fx*fx*(fx*(fx*6.0-15.0)+10.0);
  const uy = fy*fy*fy*(fy*(fy*6.0-15.0)+10.0);
  const dux = 30.0*fx*fx*(fx*(fx-2.0)+1.0); 
  const duy = 30.0*fy*fy*(fy*(fy-2.0)+1.0); 
  

  let [gax, gay] = Hash(ix, iy);
  let [gbx, gby] = Hash(ix + 1., iy);
  let [gcx, gcy] = Hash(ix, iy + 1.);
  let [gdx, gdy] = Hash(ix + 1., iy + 1.);

  let va = gax * fx + gay * fy;
  let vb = gbx * (fx - 1) + gby * fy;
  let vc = gcx * fx + gcy * (fy - 1);
  let vd = gdx * (fx - 1) + gdy * (fy - 1);
  
  const h = va + ux * (vb - va) + uy * (vc - va) + ux * uy * (va - vb - vc + vd);
  
  let dx = gax + ux * (gbx - gax) + uy * (gcx - gax) + ux * uy * (gax - gbx - gcx + gdx) + dux * (uy * (va - vb - vc + vd) + vb - va);
  let dy = gay + ux * (gby - gay) + uy * (gcy - gay) + ux * uy * (gay - gby - gcy + gdy) + duy * (ux * (va - vb - vc + vd) + vc - va);

  return [h, dx, dy];
}

function Erosion(px, py, dirx, diry){
  let a = Math.sqrt(dirx * dirx + diry * diry);

  //I added this
  dirx = (dirx / (a + .05)) * .2 + dirx * .8;
  diry = (diry / (a + .05)) * .2 + diry * .8;
  

  let ipx = Math.floor(px);
  let ipy = Math.floor(py);
  let fpx = fract(px);
  let fpy = fract(py);
  const f = 2. * Math.PI;
  let vax = 0.;
  let vay = 0.;
  let vaz = 0.;

  let wt = 0.;

  for(let i = -2; i <= 1; ++i) for(let j = -2; j <= 1; ++j){
    let ox = i;
    let oy = j;
    let [hy, hx] = Hash(ipx - ox, ipy - oy);
    hx *= .5;
    hy *= .5;

    let ppx = fpx + ox - hx;
    let ppy = fpy + oy - hy;

    let d = ppx * ppx + ppy * ppy;
    let w = Math.max(1. / (1.5 * d + d * d * (d + 4) + 1) - 1e-3 * d, 0.);//Math.exp(-d * 2.);
    wt += w;
    const mag = ppx * dirx + ppy * diry;
    
    vax += FastCos(mag * f) * w;
    vay += FastCos(mag * f + 1.57) * (dirx) * w;
    vaz += FastCos(mag * f + 1.57) * (diry) * w;
  }
  return [vax / wt, vay / wt, vaz / wt];
}

function Heightmap(uvx, uvy){
  let px = uvx * HEIGHT_TILES;
  let py = uvy * HEIGHT_TILES;

  let nx = 0.;
  let ny = 0.;
  let nz = 0.;

  let nf = 1.;
  let na = HEIGHT_AMP;
  for(let i = 0; i < HEIGHT_OCTAVES; ++i){
    const [x, y, z] = noised(px * nf, py * nf);
    
    nx += x * na * 1.;
    ny += y * na * nf;
    nz += z * na * nf;
    na *= HEIGHT_GAIN;
    nf *= HEIGHT_LACUNARITY;
  }
  
  nx = nx * .5 + .5;

  let dirx = nz * 1. * EROSION_SLOPE_STRENGTH;
  let diry = ny * -1. * EROSION_SLOPE_STRENGTH;


  let hx = 0.;
  let hy = 0.;
  let hz = 0.;

  let a = .5;
  let f = 1.;

  a *= smoothstep(WATER_HEIGHT - .13, WATER_HEIGHT + .27, nx);
  
  a *= nx;
  for(let i = 0; i < EROSION_OCTAVES; ++i){
    const [x, y, z] = Erosion(px * f * EROSION_TILES, py * f * EROSION_TILES, dirx + hz * 1. * EROSION_BRANCH_STRENGTH, diry + hy * -1. * EROSION_BRANCH_STRENGTH);
    hx += x * a * 1.;
    hy += y * a * f;
    hz += z * a * f;
    a *= EROSION_GAIN;
    f *= EROSION_LACUNARITY;
  }

  return (nx - .5) + (hx - .5) * EROSION_STRENGTH;
}

function Height(X, Z){
  return Heightmap(X / 2048., Z / 2048.) * 6144. + 2048.;
}

//https://www.reddit.com/r/javascript/comments/jxa8x/bicubic_interpolation/
function TERP(t, a, b, c, d){
  return 0.5 * (c - a + (2.0*a - 5.0*b + 4.0*c - d + (3.0*(b - c) + d - a)*t)*t)*t + b;
}

export default function Generate(){
  const Buffer = new ArrayBuffer(536870912); // 512 MiB
  const Data = new DataView(Buffer);

  const I = new Float32Array(515 * 515); //Interpolation points

  for(let z = 0; z < 515; ++z) for(let x = 0; x < 515; ++x){
    I[z * 515 + x] = Height((x - 1) * 8, (z - 1) * 8);
  }

  const Heights = new Float32Array(4096 * 4096); //Stores all the heights

  // Uninterpolated heightmap
  /*for(let z = 0; z < 4096; ++z) for(let x = 0; x < 4096; ++x){
    Heights[z << 12 | x] = Height(x, z);
  }*/

  // 8 * 8 interpolated heightmap
  for(let z8 = 0; z8 < 512; ++z8) for(let x8 = 0; x8 < 512; ++x8){
    let Min = 16777216;
    let Max = -16777216;

    const a = I[z8 * 515 + x8];
    const b = I[(z8 + 1) * 515 + x8];
    const c = I[(z8 + 2) * 515 + x8];
    const d = I[(z8 + 3) * 515 + x8];
    const e = I[z8 * 515 + (x8 + 1)];
    const f = I[(z8 + 1) * 515 + (x8 + 1)];
    const g = I[(z8 + 2) * 515 + (x8 + 1)];
    const h = I[(z8 + 3) * 515 + (x8 + 1)];
    const i = I[z8 * 515 + (x8 + 2)];
    const j = I[(z8 + 1) * 515 + (x8 + 2)];
    const k = I[(z8 + 2) * 515 + (x8 + 2)];
    const l = I[(z8 + 3) * 515 + (x8 + 2)];
    const m = I[z8 * 515 + (x8 + 3)];
    const n = I[(z8 + 1) * 515 + (x8 + 3)];
    const o = I[(z8 + 2) * 515 + (x8 + 3)];
    const p = I[(z8 + 3) * 515 + (x8 + 3)];
    for(let z1 = 0; z1 < 8; ++z1){
      const i0 = TERP(z1 / 8., a, b, c, d);
      const i1 = TERP(z1 / 8., e, f, g, h);
      const i2 = TERP(z1 / 8., i, j, k, l);
      const i3 = TERP(z1 / 8., m, n, o, p);
      for(let x1 = 0; x1 < 8; ++x1){
        const Height = TERP(x1 / 8., i0, i1, i2, i3);
        Min = Math.min(Height, Min);
        Max = Math.max(Height, Max);
        Heights[z8 << 15 | z1 << 12 | x8 << 3 | x1] = Height;
      }
    }
  }

  

  // Generate heightmap "mipmaps", useful for quickly skipping the generation of completely empty / full chunks
  const Minima8 = new Float32Array((4096 * 4096) >> 6);
  const Maxima8 = new Float32Array((4096 * 4096) >> 6);
  for(let z8 = 0; z8 < 512; ++z8) for(let x8 = 0; x8 < 512; ++x8){
    let MinX1 = Math.max(0, (x8 << 3) - 1);
    let MaxX1 = Math.min(4095, (x8 + 1) << 3);
    let MinZ1 = Math.max(0, (z8 << 3) - 1);
    let MaxZ1 = Math.min(4095, (z8 + 1) << 3);
    let MinValue = 4096.;
    let MaxValue = 0.;
    for(let z1 = MinZ1; z1 <= MaxZ1; ++z1) for(let x1 = MinX1; x1 <= MaxX1; ++x1){
      const Height = Heights[z1 << 12 | x1];
      MinValue = Math.min(MinValue, Height);
      MaxValue = Math.max(MaxValue, Height);
    }
    Minima8[z8 << 9 | x8] = MinValue;
    Maxima8[z8 << 9 | x8] = MaxValue;
  }
  
  const Minima64 = new Float32Array((4096 * 4096) >> 12);
  const Maxima64 = new Float32Array((4096 * 4096) >> 12);
  for(let z64 = 0; z64 < 64; ++z64) for(let x64 = 0; x64 < 64; ++x64){
    let MinX8 = Math.max(0, (x64 << 3) - 1);
    let MaxX8 = Math.min(511, (x64 + 1) << 3);
    let MinZ8 = Math.max(0, (z64 << 3) - 1);
    let MaxZ8 = Math.min(511, (z64 + 1) << 3);
    let MinValue = 4096.;
    let MaxValue = 0.;
    for(let z8 = MinZ8; z8 <= MaxZ8; ++z8) for(let x8 = MinX8; x8 <= MaxX8; ++x8){
      MinValue = Math.min(MinValue, Minima8[z8 << 9 | x8]);
      MaxValue = Math.max(MaxValue, Maxima8[z8 << 9 | x8]);
    }
    Minima64[z64 << 6 | x64] = MinValue;
    Maxima64[z64 << 6 | x64] = MaxValue;
  }

  const Minima512 = new Float32Array((4096 * 4096) >> 18);
  const Maxima512 = new Float32Array((4096 * 4096) >> 18);
  for(let z512 = 0; z512 < 8; ++z512) for(let x512 = 0; x512 < 8; ++x512){
    let MinX64 = Math.max(0, (x512 << 3) - 1);
    let MaxX64 = Math.min(63, (x512 + 1) << 3);
    let MinZ64 = Math.max(0, (z512 << 3) - 1);
    let MaxZ64 = Math.min(63, (z512 + 1) << 3);
    let MinValue = 4096.;
    let MaxValue = 0.;
    for(let z64 = MinZ64; z64 <= MaxZ64; ++z64) for(let x64 = MinX64; x64 <= MaxX64; ++x64){
      MinValue = Math.min(MinValue, Minima64[z64 << 6 | x64]);
      MaxValue = Math.max(MaxValue, Maxima64[z64 << 6 | x64]);
    }
    Minima512[z512 << 3 | x512] = MinValue;
    Maxima512[z512 << 3 | x512] = MaxValue;
  }

  
  let Index = 0;

  const Allocate = function(Size){
    const Location = Index;
    Index += Size;
    return Location;
  };

  Allocate(8 * 8 * 8 * 4); //Space for Location512's
  
  
  for(let z512 = 0; z512 < 8; ++z512) for(let x512 = 0; x512 < 8; ++x512){
    const MinY512 = Math.max(0, Math.floor(Minima512[z512 << 3 | x512] / 512.));
    const MaxY512 = Math.min(7, Math.ceil(Maxima512[z512 << 3 | x512] / 512.));
    for(let y512 = MinY512; y512 <= MaxY512; ++y512){
      const Location512 = Allocate(8 * 8 * 8 * 4);
      Data.setUint32((z512 << 6 | x512 << 3 | y512) * 4, Location512, true);


      const Heights64Offset = z512 << 9 | x512 << 3;
      for(let z64 = 0; z64 < 8; ++z64) for(let x64 = 0; x64 < 8; ++x64){
        const MinY64 = Math.max(0, Math.floor(Minima64[Heights64Offset | z64 << 6 | x64] / 64.) - (y512 << 3));
        const MaxY64 = Math.min(7, Math.ceil(Maxima64[Heights64Offset | z64 << 6 | x64] / 64.) - (y512 << 3));
        for(let y64 = MinY64; y64 <= MaxY64; ++y64){
          const Location64 = Allocate(8 * 8 * 8 * 4);
          Data.setUint32(Location512 + (z64 << 6 | x64 << 3 | y64) * 4, Location64, true);


          const Heights8Offset = z512 << 15 | z64 << 12 | x512 << 6 | x64 << 3;
          for(let z8 = 0; z8 < 8; ++z8) for(let x8 = 0; x8 < 8; ++x8){
            const MinY8 = Math.max(0, Math.floor(Minima8[Heights8Offset | z8 << 9 | x8] / 8.) - (y512 << 6 | y64 << 3));
            const MaxY8 = Math.min(7, Math.ceil(Maxima8[Heights8Offset | z8 << 9 | x8] / 8.) - (y512 << 6 | y64 << 3));
            for(let y8 = MinY8; y8 <= MaxY8; ++y8){
              const Location8 = Allocate(8 * 8); //Only storing the bitmask here
              Data.setUint32(Location64 + (z8 << 6 | x8 << 3 | y8) * 4, Location8, true);


              const Heights1Offset = z512 << 21 | z64 << 18 | z8 << 15 | x512 << 9 | x64 << 6 | x8 << 3;
              for(let z1 = 0; z1 < 8; ++z1) for(let x1 = 0; x1 < 8; ++x1){
                const RelativeHeight = Math.min(Math.max(Heights[Heights1Offset | z1 << 12 | x1] - (y512 << 9 | y64 << 6 | y8 << 3), 0), 8);
                const Bitmask = 255 >> (8 - RelativeHeight);
                Data.setUint8(Location8 + (z1 << 3 | x1), Bitmask, true);
              }
              //8
            }
          }
          //64
        }
      }
      //512
    }
  }

  return {
    "Buffer": Buffer,
    "Size": Index
  };
};