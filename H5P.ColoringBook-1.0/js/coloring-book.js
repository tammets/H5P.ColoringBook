var H5P = H5P || {};

H5P.ColoringBook = (function ($) {
  function ColoringBook(params, id) {
    this.params = (params && params.coloringBook) ? params.coloringBook : {};

    // Safest possible way to set defaults
    let colorString = '#FF0000, #00FF00, #0000FF, #FFFF00, #00FFFF, #FF00FF, #800000, #008000, #000080, #808080'; // Ultimate fallback
    if (this.params.colorPalette && typeof this.params.colorPalette === 'string') {
      colorString = this.params.colorPalette;
    }
    this.colors = colorString.split(',').map(color => color.trim()).filter(color => color.length > 0);

    this.params.tools = this.params.tools || {};
    this.params.tools.brushSize = this.params.tools.brushSize || 10;
    this.params.tools.enableEraser = this.params.tools.enableEraser !== false;
    this.params.tools.enableFill = this.params.tools.enableFill !== false;
    this.params.instructions = this.params.instructions || '';

    this.id = id;

    // Runtime variables
    this.canvas = null;
    this.ctx = null;
    this.currentTool = 'brush';
    this.currentColor = this.colors.length > 0 ? this.colors[0] : '#000000';
    this.brushSize = this.params.tools.brushSize;
    this.isDrawing = false;
  }

  ColoringBook.prototype.toolIcons = {
    brush: '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M23,3l-7,5L4.031,19.875l1,1L3,25l1,1l-2,2l3,1l1-1l1,1l4-2l1,1l12-12l5-7L23,3z M16.704,10.118 l5.174,5.174l-9.586,9.586l-5.212-5.212L16.704,10.118z M5.427,24.599l1.24-2.518L9.9,25.314l-2.505,1.253L5.427,24.599z M23.155,13.741l-4.897-4.897l4.525-3.232l3.604,3.604L23.155,13.741z"></path></svg>',
    eraser: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8.086 2.207a2 2 0 0 1 2.828 0l3.879 3.879a2 2 0 0 1 0 2.828l-5.5 5.5A2 2 0 0 1 7.879 15H5.12a2 2 0 0 1-1.414-.586l-2.5-2.5a2 2 0 0 1 0-2.828l6.879-6.879zm.66 11.34L3.453 8.254 1.914 9.793a1 1 0 0 0 0 1.414l2.5 2.5a1 1 0 0 0 .707.293H7.88a1 1 0 0 0 .707-.293l.16-.16z"/></svg>',
    fill: '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M21,12.17V6c0-1.206-0.799-3-3-3s-3,1.794-3,3v2.021L10.054,13H6c-1.105,0-2,0.895-2,2v9h2v-7 l12,12l10-10L21,12.17z M18,5c0.806,0,0.988,0.55,1,1v4.17l-2-2V6.012C17.012,5.55,17.194,5,18,5z M18,26l-9-9l6-6v6h2v-6.001L25,19 L18,26z M4,26h2v2H4V26z"></path></svg>',
    download: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>'
  };

  /**
   * Attach function - the only thing that should run.
   *
   * @param {H5P.jQuery} $container
   */
  ColoringBook.prototype.attach = function ($container) {
    const self = this;
    this.$container = $container;
    $container.addClass('h5p-coloring-book');

    // Create main content structure
    const canvasId = 'h5p-coloring-book-canvas-' + this.id;
    this.$canvas = $('<canvas>')
      .attr('id', canvasId)
      .css({ cursor: 'crosshair' });

    this.$canvasContainer = $('<div>')
      .addClass('h5p-coloring-book-canvas-container')
      .append(this.$canvas);

    const $toolbar = this.createToolbar();

    if (this.params.instructions) {
      $container.append($('<div>').addClass('h5p-coloring-book-instructions').html(this.params.instructions));
    }

    $container.append($toolbar);
    $container.append(this.$canvasContainer);

    // Initialize canvas and context
    this.canvas = this.$canvas[0];
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    // Load background image and set canvas size
    const image = new Image();
    image.crossOrigin = 'Anonymous';
    image.onload = function () {
      self.canvas.width = image.width;
      self.canvas.height = image.height;
      self.ctx.drawImage(image, 0, 0);
      self.loadState();
      H5P.trigger(self, 'resize');
    };
    if (this.params.image && this.params.image.path) {
      image.src = H5P.getPath(this.params.image.path, this.id);
    } else {
      this.canvas.width = 800;
      this.canvas.height = 600;
      this.loadState();
      H5P.trigger(self, 'resize');
    }

    this.setupEventListeners();
  };

  ColoringBook.prototype.createToolbar = function () {
    const self = this;
    const $toolbar = $('<div>').addClass('h5p-coloring-book-toolbar');

    // Tools
    $toolbar.append(this.createToolButton('brush', 'Brush'));
    if (this.params.tools.enableEraser) {
      $toolbar.append(this.createToolButton('eraser', 'Eraser'));
    }
    if (this.params.tools.enableFill) {
      $toolbar.append(this.createToolButton('fill', 'Fill'));
    }

    // Color Palette
    const $colorPalette = $('<div>').addClass('h5p-coloring-book-color-palette');
    this.colors.forEach(function (color) {
      $colorPalette.append(self.createColorButton(color));
    });
    $toolbar.append($colorPalette);

    // Brush Size
    const $brushSize = $('<div>').addClass('h5p-coloring-book-brush-size').append(
      $('<label>').text('Brush Size: '),
      $('<input>', {
        type: 'range',
        min: 1,
        max: 50,
        value: this.brushSize,
        change: function () { self.brushSize = $(this).val(); }
      })
    );
    $toolbar.append($brushSize);

    // Download Button
    const $downloadButton = this.createToolButton('download', 'Download');
    $downloadButton.addClass('h5p-coloring-book-download-button');
    $toolbar.append($downloadButton);

    return $toolbar;
  };

  ColoringBook.prototype.createToolButton = function (tool, label) {
    const self = this;
    const $button = $('<div>', {
      class: 'h5p-coloring-book-tool-button',
      role: 'button',
      tabindex: 0
    });

    const iconSvg = this.toolIcons[tool];
    if (iconSvg) {
      $button.append($(iconSvg)).attr('aria-label', label);
    } else {
      $button.text(label);
    }
    
    if (tool === 'download') {
      $button.on('click keydown', function (e) {
        if (e.type === 'click' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          self.downloadImage();
        }
      });
    } else {
      $button.on('click keydown', function (e) {
        if (e.type === 'click' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          self.currentTool = tool;
          if (tool === 'brush' || tool === 'eraser' || tool === 'fill') {
            $(this).closest('.h5p-coloring-book-toolbar').find('.h5p-coloring-book-tool-button').removeClass('active');
            $(this).addClass('active');
          }
        }
      });
    }

    return $button;
  };

  ColoringBook.prototype.createColorButton = function (color) {
    const self = this;
    return $('<div>', {
      class: 'h5p-coloring-book-color-button',
      role: 'button',
      tabindex: 0,
      'aria-label': color,
      css: { backgroundColor: color }
    }).on('click keydown', function (e) {
      if (e.type === 'click' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        self.currentColor = color;
        $(this).addClass('active').siblings().removeClass('active');
      }
    });
  };

  ColoringBook.prototype.setupEventListeners = function () {
    const self = this;

    this.$canvas.on('mousedown', function (e) {
      if (self.currentTool === 'fill') {
        self.floodFill(e.offsetX, e.offsetY);
        self.saveState();
        return;
      }
      self.isDrawing = true;
      self.lastX = e.offsetX;
      self.lastY = e.offsetY;
    });

    this.$canvas.on('mousemove', function (e) {
      if (!self.isDrawing) return;
      self.draw(self.lastX, self.lastY, e.offsetX, e.offsetY);
      self.lastX = e.offsetX;
      self.lastY = e.offsetY;
    });

    this.$canvas.on('mouseup mouseout', function () {
      if (self.isDrawing) {
        self.isDrawing = false;
        self.saveState();
      }
    });

    // Set the initial active tool
    this.$container.find('.h5p-coloring-book-tool-button[aria-label="Brush"]').addClass('active');
  };

  ColoringBook.prototype.draw = function (x1, y1, x2, y2) {
    this.ctx.beginPath();
    this.ctx.strokeStyle = (this.currentTool === 'eraser') ? '#FFFFFF' : this.currentColor;
    this.ctx.lineWidth = this.brushSize;
    this.ctx.lineCap = 'round';
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
    this.ctx.closePath();
  };

  ColoringBook.prototype.floodFill = function(startX, startY) {
    const ctx = this.ctx;
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    const startPos = (startY * canvasWidth + startX) * 4;
    const pixelData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    const startColor = [
      pixelData.data[startPos],
      pixelData.data[startPos + 1],
      pixelData.data[startPos + 2],
      pixelData.data[startPos + 3]
    ];
    const fillColor = this.hexToRgb(this.currentColor);

    if (
      fillColor.r === startColor[0] &&
      fillColor.g === startColor[1] &&
      fillColor.b === startColor[2]
    ) {
      return; // Trying to fill with the same color
    }

    const pixelStack = [[startX, startY]];

    while (pixelStack.length) {
      const newPos = pixelStack.pop();
      let x = newPos[0];
      let y = newPos[1];

      let pixelPos = (y * canvasWidth + x) * 4;

      while (y-- >= 0 && this.matchStartColor(pixelPos, startColor, pixelData.data)) {
        pixelPos -= canvasWidth * 4;
      }
      pixelPos += canvasWidth * 4;
      ++y;

      let reachLeft = false;
      let reachRight = false;
      while (y++ < canvasHeight - 1 && this.matchStartColor(pixelPos, startColor, pixelData.data)) {
        this.colorPixel(pixelPos, fillColor, pixelData.data);

        if (x > 0) {
          if (this.matchStartColor(pixelPos - 4, startColor, pixelData.data)) {
            if (!reachLeft) {
              pixelStack.push([x - 1, y]);
              reachLeft = true;
            }
          } else if (reachLeft) {
            reachLeft = false;
          }
        }

        if (x < canvasWidth - 1) {
          if (this.matchStartColor(pixelPos + 4, startColor, pixelData.data)) {
            if (!reachRight) {
              pixelStack.push([x + 1, y]);
              reachRight = true;
            }
          } else if (reachRight) {
            reachRight = false;
          }
        }
        pixelPos += canvasWidth * 4;
      }
    }
    ctx.putImageData(pixelData, 0, 0);
  };

  ColoringBook.prototype.matchStartColor = function(pixelPos, startColor, pixelData) {
    return (
      pixelData[pixelPos] === startColor[0] &&
      pixelData[pixelPos + 1] === startColor[1] &&
      pixelData[pixelPos + 2] === startColor[2] &&
      pixelData[pixelPos + 3] === startColor[3]
    );
  };

  ColoringBook.prototype.colorPixel = function(pixelPos, fillColor, pixelData) {
    pixelData[pixelPos] = fillColor.r;
    pixelData[pixelPos + 1] = fillColor.g;
    pixelData[pixelPos + 2] = fillColor.b;
    pixelData[pixelPos + 3] = 255; // Alpha
  };

  ColoringBook.prototype.hexToRgb = function(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };

  ColoringBook.prototype.downloadImage = function () {
    const link = document.createElement('a');
    link.download = 'my-coloring.png';
    link.href = this.canvas.toDataURL('image/png');
    link.click();
  };

  ColoringBook.prototype.saveState = function () {
    const data = this.canvas.toDataURL();
    this.params.previousState = data;
  };

  ColoringBook.prototype.loadState = function () {
    if (this.params.previousState) {
      const img = new Image();
      img.onload = () => {
        this.ctx.drawImage(img, 0, 0);
      };
      img.src = this.params.previousState;
    }
  };

  return ColoringBook;
})(window.jQuery); 