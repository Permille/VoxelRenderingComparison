const path = require("path");

// https://github.com/webpack/webpack-cli/issues/312
class BannerPlugin {
  constructor(options) {
    this.banner = options.banner;
  }

  apply(compiler) {
    compiler.hooks.emit.tapAsync('FileListPlugin', (compilation, callback) => {
      compilation.chunks.forEach(chunk => {
        chunk.files.forEach(filename => {
          const asset = compilation.assets[filename];
          asset._value = this.banner + asset._value; // append banner
        });
      });

      callback();
    });
  }
}

module.exports = {
  "entry": "./src/Main.mjs",
  "target": "web",
  "output": {
    "filename": "Bundle.js",
    "path": path.resolve(__dirname, "dist")
  },
  "plugins": [
    new BannerPlugin({
      "banner": "//Copyright 2023 Permille.io. All rights reserved.\n"
    }),
  ],
  "resolve":{
    "fallback":{
      "crypto": false
    }
  },
  "experiments":{
    "topLevelAwait": true
  },
  "resolveLoader":{
    "alias":{
      "TemplateCSSLoader": path.resolve(__dirname, "TemplateCSSLoader.js"),
      "TemplateHTMLLoader": path.resolve(__dirname, "TemplateHTMLLoader.js"),
      "WatCompilerLoader": path.resolve(__dirname, "WatCompilerLoader.js")
    }
  },
  "module":{
    "rules":[
      {
        "test": /\.(woff|woff2|ttf|eot|png|svg|bmp|tbf|bin|bo3)$/i,
        "type": "asset/resource"
      },
      {
        "test": /\.(fsh|vsh|glsl|wgsl)$/i,
        "type": "asset/source"
      },
      {
        "test": /\.css$/i,
        "use": ["TemplateCSSLoader"]
      },
      {
        "test": /\.(html|xhtml)$/i,
        "use": ["TemplateHTMLLoader"]
      },
      {
        "test": /\.wat$/i,
        "use": ["WatCompilerLoader"]
      },
      {
        "resourceQuery": /file/i,
        "type": 'asset/resource',
      },
      {
        "resourceQuery": /url/i,
        "type": 'asset/inline',
      },
      {
        "resourceQuery": /raw/i,
        "type": 'asset/source',
      },
      {
        "resourceQuery": /copy/i,
        "loader": "file-loader",
        "options": {
          "name": "[name].[ext]"
        }
      }
    ]
  }
};