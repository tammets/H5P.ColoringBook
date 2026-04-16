var H5P = H5P || {};

H5P.ColoringBook = (function () {

  function ColoringBook(params, id, contentData) {
    // Inherit EventDispatcher
    H5P.EventDispatcher.call(this);

    this.params = (params && params.coloringBook) ? params.coloringBook : {};
    this.l10n = (params && params.l10n) ? params.l10n : {};

    // Initialize colors
    var defaultFallbackColors = [
      '#FF0000', '#FFA500', '#FFFF00', '#008000', '#0000FF',
      '#800080', '#FFC0CB', '#FFFFFF', '#8B4513', '#000000'
    ];
    this.colors = defaultFallbackColors;

    this.params.tools = this.params.tools || {};
    this.params.tools.brushSize = this.params.tools.brushSize || 10;
    this.params.tools.enableEraser = this.params.tools.enableEraser !== false;
    this.params.tools.enableFill = this.params.tools.enableFill !== false;
    this.params.tools.enableTextTool = this.params.tools.enableTextTool === true;
    this.params.instructions = this.params.instructions || '';

    this.id = id;
    this.previousState = (contentData && contentData.previousState) ? contentData.previousState : null;

    // Runtime variables
    this.canvas = null;
    this.ctx = null;
    this.originalImageData = null; // Store original background for eraser
    this.currentTool = 'brush';
    this.currentColor = this.colors[0];
    this.brushSize = this.params.tools.brushSize;
    this.isDrawing = false;

    // For Undo functionality
    this.historyStack = [];
    this.MAX_HISTORY_STATES = 20;
    this.$undoButton = null;
  }

  // Inherit from EventDispatcher
  ColoringBook.prototype = Object.create(H5P.EventDispatcher.prototype);
  ColoringBook.prototype.constructor = ColoringBook;

  /**
   * Helper to get a translated string with fallback.
   */
  ColoringBook.prototype.t = function (key, fallback) {
    return (this.l10n && this.l10n[key]) ? this.l10n[key] : fallback;
  };

  ColoringBook.prototype.toolIcons = {
    brush: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" /></svg>',
    eraser: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M20.454 19.028h-7.01l6.62-6.63a2.94 2.94 0 0 0 .87-2.09a2.84 2.84 0 0 0-.87-2.05l-3.42-3.44a2.93 2.93 0 0 0-4.13.01L3.934 13.4a2.946 2.946 0 0 0 0 4.14l1.48 1.49h-1.86a.5.5 0 0 0 0 1h16.9a.5.5 0 0 0 0-1.002m-7.24-13.5a1.956 1.956 0 0 1 2.73 0l3.42 3.44a1.87 1.87 0 0 1 .57 1.35a1.93 1.93 0 0 1-.57 1.37l-5.64 5.64l-6.15-6.16Zm-1.19 13.5h-5.2l-2.18-2.2a1.93 1.93 0 0 1 0-2.72l2.23-2.23l6.15 6.15Z"/></svg>',
    fill: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42" /></svg>',
    download: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>',
    undo: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="m15 15-6 6m0 0-6-6m6 6V9a6 6 0 0 1 12 0v3" /></svg>',
    text: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" /></svg>',
    loadImage: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>',
    fullscreen: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>',
    exitFullscreen: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" /></svg>'
  };

  /**
   * Attach function called by H5P framework.
   *
   * @param {H5P.jQuery} $container
   */
  ColoringBook.prototype.attach = function ($container) {
    var self = this;
    this.$container = $container;
    $container.addClass('h5p-coloring-book');

    // Create main content structure
    var canvasId = 'h5p-coloring-book-canvas-' + this.id;
    this.$canvas = H5P.jQuery('<canvas>')
      .attr('id', canvasId)
      .css({ cursor: 'crosshair' });

    this.$canvasContainer = H5P.jQuery('<div>')
      .addClass('h5p-coloring-book-canvas-container')
      .append(this.$canvas);

    var $toolbar = this.createToolbar();

    if (this.params.instructions) {
      var instructionsText = this.params.instructions.replace(/\n/g, '<br>');
      $container.append(H5P.jQuery('<div>').addClass('h5p-coloring-book-instructions').html(instructionsText));
    }

    $container.append($toolbar);
    $container.append(this.$canvasContainer);

    // Initialize canvas and context
    this.canvas = this.$canvas[0];
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.historyStack = [];

    // Load background image or restore previous state
    if (this.previousState) {
      this.restoreState(this.previousState);
    } else {
      this.loadInitialImage();
    }

    this.setupEventListeners();
    if (this.$undoButton) {
      this.updateUndoButtonState();
    }

    // Fullscreen event listeners
    var fullscreenLabel = this.t('fullscreen', 'Fullscreen');
    var exitFullscreenLabel = this.t('exitFullscreen', 'Exit Fullscreen');
    var $fullscreenButton = this.$container.find('.h5p-coloring-book-tool-button[data-tool="fullscreen"]');
    if ($fullscreenButton.length) {
      this.on('enterFullScreen', function () {
        $fullscreenButton.find('svg').replaceWith(H5P.jQuery(self.toolIcons.exitFullscreen));
        $fullscreenButton.attr('title', exitFullscreenLabel).attr('aria-label', exitFullscreenLabel);
      });
      this.on('exitFullScreen', function () {
        $fullscreenButton.find('svg').replaceWith(H5P.jQuery(self.toolIcons.fullscreen));
        $fullscreenButton.attr('title', fullscreenLabel).attr('aria-label', fullscreenLabel);
      });
    }
  };

  /**
   * Load the initial image onto the canvas.
   */
  ColoringBook.prototype.loadInitialImage = function () {
    var self = this;
    var image = new Image();
    image.crossOrigin = 'Anonymous';
    image.onload = function () {
      var width = image.width;
      var height = image.height;
      var maxWidth = self.params.maxWidth || 800;
      var maxHeight = self.params.maxHeight || 600;

      if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = (maxHeight / height) * width;
        height = maxHeight;
      }

      self.canvas.width = width;
      self.canvas.height = height;
      self.ctx.clearRect(0, 0, width, height);
      self.ctx.drawImage(image, 0, 0, width, height);
      self.originalImageData = self.ctx.getImageData(0, 0, width, height);
      self.pushCurrentStateToHistory();
      self.trigger('resize');
    };
    image.onerror = function () {
      self.canvas.width = self.params.maxWidth || 800;
      self.canvas.height = self.params.maxHeight || 600;
      self.ctx.fillStyle = '#FFFFFF';
      self.ctx.fillRect(0, 0, self.canvas.width, self.canvas.height);
      self.originalImageData = self.ctx.getImageData(0, 0, self.canvas.width, self.canvas.height);
      self.pushCurrentStateToHistory();
      self.trigger('resize');
    };

    if (this.params.image && this.params.image.path) {
      image.src = H5P.getPath(this.params.image.path, this.id);
    } else {
      image.dispatchEvent(new Event('error'));
    }
  };

  /**
   * Restore canvas from a saved state.
   */
  ColoringBook.prototype.restoreState = function (state) {
    var self = this;
    var img = new Image();
    img.onload = function () {
      self.canvas.width = img.width;
      self.canvas.height = img.height;
      self.ctx.drawImage(img, 0, 0);
      // Use restored image as baseline for eraser
      self.originalImageData = self.ctx.getImageData(0, 0, self.canvas.width, self.canvas.height);
      self.pushCurrentStateToHistory();
      self.trigger('resize');
    };
    img.src = state;
  };

  /**
   * Return the current state for H5P state persistence.
   */
  ColoringBook.prototype.getCurrentState = function () {
    if (!this.canvas) {
      return undefined;
    }
    return this.canvas.toDataURL();
  };

  ColoringBook.prototype.createToolbar = function () {
    var self = this;
    var $toolbar = H5P.jQuery('<div>').addClass('h5p-coloring-book-toolbar');

    // --- First Row: Main Tools ---
    var $mainToolsRow = H5P.jQuery('<div>').addClass('h5p-coloring-book-toolbar-row h5p-coloring-book-main-tools');

    $mainToolsRow.append(this.createToolButton('brush', this.t('brush', 'Brush')));
    if (this.params.tools.enableEraser) {
      $mainToolsRow.append(this.createToolButton('eraser', this.t('eraser', 'Eraser')));
    }
    if (this.params.tools.enableFill) {
      $mainToolsRow.append(this.createToolButton('fill', this.t('fill', 'Fill')));
    }
    if (this.params.tools.enableTextTool) {
      $mainToolsRow.append(this.createToolButton('text', this.t('addText', 'Add Text')));
    }

    $mainToolsRow.append(this.createToolButton('loadImage', this.t('loadImage', 'Load Image')));

    var $undoButton = this.createToolButton('undo', this.t('undo', 'Undo'));
    this.$undoButton = $undoButton;
    $mainToolsRow.append($undoButton);

    var $downloadButton = this.createToolButton('download', this.t('download', 'Download'));
    $downloadButton.addClass('h5p-coloring-book-download-button');
    $mainToolsRow.append($downloadButton);

    if (H5P.canHasFullScreen !== false) {
      var $fullscreenButton = this.createToolButton('fullscreen', this.t('fullscreen', 'Fullscreen'));
      $fullscreenButton.on('click keydown', function (e) {
        if (e.type === 'click' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          self.toggleFullScreen();
        }
      });
      $mainToolsRow.append($fullscreenButton);
    }

    $toolbar.append($mainToolsRow);

    // --- Second Row: Colors and Brush Size ---
    var $secondaryControlsRow = H5P.jQuery('<div>').addClass('h5p-coloring-book-toolbar-row h5p-coloring-book-secondary-controls');

    var $colorPalette = H5P.jQuery('<div>').addClass('h5p-coloring-book-color-palette');
    this.colors.forEach(function (color) {
      $colorPalette.append(self.createColorButton(color));
    });
    $secondaryControlsRow.append($colorPalette);

    var $brushSize = H5P.jQuery('<div>').addClass('h5p-coloring-book-brush-size').append(
      H5P.jQuery('<label>').text(this.t('brushSize', 'Brush Size: ')),
      H5P.jQuery('<input>', {
        type: 'range',
        min: 1,
        max: 50,
        value: this.brushSize,
        change: function () { self.brushSize = H5P.jQuery(this).val(); }
      })
    );
    $secondaryControlsRow.append($brushSize);

    $toolbar.append($secondaryControlsRow);

    return $toolbar;
  };

  ColoringBook.prototype.createToolButton = function (tool, label) {
    var self = this;
    var $button = H5P.jQuery('<div>', {
      'class': 'h5p-coloring-book-tool-button',
      'role': 'button',
      'tabindex': 0,
      'title': label,
      'data-tool': tool
    });

    var iconSvg = this.toolIcons[tool];
    if (iconSvg) {
      $button.append(H5P.jQuery(iconSvg)).attr('aria-label', label);
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
    } else if (tool === 'undo') {
      $button.on('click keydown', function (e) {
        if (e.type === 'click' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          self.undoLastAction();
        }
      }).addClass('disabled');
    } else if (tool === 'loadImage') {
      $button.on('click keydown', function (e) {
        if (e.type === 'click' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          self.promptForImage();
        }
      });
    } else if (tool === 'text') {
      $button.on('click keydown', function (e) {
        if (e.type === 'click' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          self.currentTool = tool;
          self.$canvas.css('cursor', 'text');
          H5P.jQuery(this).closest('.h5p-coloring-book-toolbar').find('.h5p-coloring-book-tool-button').removeClass('active');
          H5P.jQuery(this).addClass('active');
        }
      });
    } else if (tool !== 'fullscreen') {
      $button.on('click keydown', function (e) {
        if (e.type === 'click' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          self.currentTool = tool;
          self.$canvas.css('cursor', 'crosshair');
          H5P.jQuery(this).closest('.h5p-coloring-book-toolbar').find('.h5p-coloring-book-tool-button').removeClass('active');
          H5P.jQuery(this).addClass('active');
        }
      });
    }

    return $button;
  };

  ColoringBook.prototype.createColorButton = function (color) {
    var self = this;
    return H5P.jQuery('<div>', {
      'class': 'h5p-coloring-book-color-button',
      'role': 'button',
      'tabindex': 0,
      'aria-label': color,
      css: { backgroundColor: color }
    }).on('click keydown', function (e) {
      if (e.type === 'click' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        self.currentColor = color;
        H5P.jQuery(this).addClass('active').siblings().removeClass('active');
      }
    });
  };

  /**
   * Get canvas coordinates from a mouse or touch event.
   */
  ColoringBook.prototype.getCanvasCoords = function (e) {
    var rect = this.canvas.getBoundingClientRect();
    var scaleX = this.canvas.width / rect.width;
    var scaleY = this.canvas.height / rect.height;
    var clientX, clientY;

    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: Math.floor((clientX - rect.left) * scaleX),
      y: Math.floor((clientY - rect.top) * scaleY)
    };
  };

  ColoringBook.prototype.setupEventListeners = function () {
    var self = this;

    function onPointerDown(e) {
      // Use originalEvent for touch events accessed via jQuery
      var evt = e.originalEvent || e;
      if (evt.touches) {
        evt.preventDefault(); // Prevent scrolling while drawing
      }
      var coords = self.getCanvasCoords(evt);

      if (self.currentTool === 'fill') {
        self.floodFill(coords.x, coords.y);
        self.pushCurrentStateToHistory();
        return;
      }
      if (self.currentTool === 'text') {
        self.handleTextToolClick(coords.x, coords.y);
        return;
      }
      self.isDrawing = true;
      self.lastX = coords.x;
      self.lastY = coords.y;
    }

    function onPointerMove(e) {
      if (!self.isDrawing) return;
      var evt = e.originalEvent || e;
      if (evt.touches) {
        evt.preventDefault();
      }
      var coords = self.getCanvasCoords(evt);
      self.draw(self.lastX, self.lastY, coords.x, coords.y);
      self.lastX = coords.x;
      self.lastY = coords.y;
    }

    function onPointerUp() {
      if (self.isDrawing) {
        self.isDrawing = false;
        self.pushCurrentStateToHistory();
      }
    }

    // Mouse events
    this.$canvas.on('mousedown', onPointerDown);
    this.$canvas.on('mousemove', onPointerMove);
    this.$canvas.on('mouseup mouseout', onPointerUp);

    // Touch events
    this.$canvas.on('touchstart', onPointerDown);
    this.$canvas.on('touchmove', onPointerMove);
    this.$canvas.on('touchend touchcancel', onPointerUp);

    // Set the initial active tool
    this.$container.find('.h5p-coloring-book-tool-button[data-tool="brush"]').addClass('active');
  };

  ColoringBook.prototype.draw = function (x1, y1, x2, y2) {
    if (this.currentTool === 'eraser') {
      this.eraseStroke(x1, y1, x2, y2);
    } else {
      this.ctx.beginPath();
      this.ctx.strokeStyle = this.currentColor;
      this.ctx.lineWidth = this.brushSize;
      this.ctx.lineCap = 'round';
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();
      this.ctx.closePath();
    }
  };

  /**
   * Erase by restoring original background pixels along the stroke path.
   */
  ColoringBook.prototype.eraseStroke = function (x1, y1, x2, y2) {
    if (!this.originalImageData) {
      // Fallback: paint white if no original image stored
      this.ctx.beginPath();
      this.ctx.strokeStyle = '#FFFFFF';
      this.ctx.lineWidth = this.brushSize;
      this.ctx.lineCap = 'round';
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();
      this.ctx.closePath();
      return;
    }

    // Use a temporary canvas to create a stroke mask, then composite original pixels
    var radius = Math.ceil(this.brushSize / 2);
    var minX = Math.max(0, Math.min(x1, x2) - radius);
    var minY = Math.max(0, Math.min(y1, y2) - radius);
    var maxX = Math.min(this.canvas.width, Math.max(x1, x2) + radius);
    var maxY = Math.min(this.canvas.height, Math.max(y1, y2) + radius);
    var w = maxX - minX;
    var h = maxY - minY;
    if (w <= 0 || h <= 0) return;

    // Save current state and draw stroke as mask
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'destination-out';
    this.ctx.beginPath();
    this.ctx.lineWidth = this.brushSize;
    this.ctx.lineCap = 'round';
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
    this.ctx.closePath();
    this.ctx.restore();

    // Draw original image pixels underneath using destination-over
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'destination-over';
    this.ctx.putImageData(
      this.originalImageData,
      0, 0,
      minX, minY, w, h
    );
    this.ctx.restore();
  };

  ColoringBook.prototype.floodFill = function (startX, startY) {
    var ctx = this.ctx;
    var canvasWidth = this.canvas.width;
    var canvasHeight = this.canvas.height;
    var startPos = (startY * canvasWidth + startX) * 4;
    var pixelData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    var startColor = [
      pixelData.data[startPos],
      pixelData.data[startPos + 1],
      pixelData.data[startPos + 2],
      pixelData.data[startPos + 3]
    ];
    var fillColor = this.hexToRgb(this.currentColor);

    if (
      fillColor.r === startColor[0] &&
      fillColor.g === startColor[1] &&
      fillColor.b === startColor[2]
    ) {
      return;
    }

    var pixelStack = [[startX, startY]];

    while (pixelStack.length) {
      var newPos = pixelStack.pop();
      var x = newPos[0];
      var y = newPos[1];
      var pixelPos = (y * canvasWidth + x) * 4;

      while (y-- >= 0 && this.matchStartColor(pixelPos, startColor, pixelData.data)) {
        pixelPos -= canvasWidth * 4;
      }
      pixelPos += canvasWidth * 4;
      ++y;

      var reachLeft = false;
      var reachRight = false;
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

  ColoringBook.prototype.matchStartColor = function (pixelPos, startColor, pixelData) {
    return (
      pixelData[pixelPos] === startColor[0] &&
      pixelData[pixelPos + 1] === startColor[1] &&
      pixelData[pixelPos + 2] === startColor[2] &&
      pixelData[pixelPos + 3] === startColor[3]
    );
  };

  ColoringBook.prototype.colorPixel = function (pixelPos, fillColor, pixelData) {
    pixelData[pixelPos] = fillColor.r;
    pixelData[pixelPos + 1] = fillColor.g;
    pixelData[pixelPos + 2] = fillColor.b;
    pixelData[pixelPos + 3] = 255;
  };

  ColoringBook.prototype.hexToRgb = function (hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };

  ColoringBook.prototype.downloadImage = function () {
    var link = document.createElement('a');
    link.download = 'my-coloring.png';
    link.href = this.canvas.toDataURL('image/png');
    link.click();
  };

  ColoringBook.prototype.pushCurrentStateToHistory = function () {
    if (!this.canvas || !this.ctx) return;

    var dataUrl = this.canvas.toDataURL();

    if (this.historyStack.length > 0 && this.historyStack[this.historyStack.length - 1] === dataUrl) {
      return;
    }

    this.historyStack.push(dataUrl);

    if (this.historyStack.length > this.MAX_HISTORY_STATES) {
      this.historyStack.shift();
    }

    this.updateUndoButtonState();
  };

  ColoringBook.prototype.undoLastAction = function () {
    if (this.historyStack.length <= 1) {
      return;
    }

    this.historyStack.pop();
    var prevStateDataUrl = this.historyStack[this.historyStack.length - 1];

    var img = new Image();
    var self = this;
    img.onload = function () {
      self.ctx.clearRect(0, 0, self.canvas.width, self.canvas.height);
      self.ctx.drawImage(img, 0, 0);
    };
    img.src = prevStateDataUrl;

    this.updateUndoButtonState();
  };

  ColoringBook.prototype.promptForImage = function () {
    var self = this;
    var $fileInput = this.$container.find('.h5p-coloring-book-file-input');
    if (!$fileInput.length) {
      $fileInput = H5P.jQuery('<input type="file" class="h5p-coloring-book-file-input" accept="image/*" style="display:none">')
        .on('change', function (e) {
          var file = e.target.files[0];
          if (file) {
            if (file.size > 5 * 1024 * 1024) {
              self.showNotification(self.t('fileTooLarge', 'File is too large. Please choose an image under 5MB.'));
              H5P.jQuery(this).val('');
              return;
            }
            var reader = new FileReader();
            reader.onload = function (event) {
              self.loadNewImageOntoCanvas(event.target.result);
            };
            reader.onerror = function () {
              self.showNotification(self.t('errorReadingFile', 'Error reading file.'));
            };
            reader.readAsDataURL(file);
            H5P.jQuery(this).val('');
          }
        });
      this.$container.append($fileInput);
    }
    $fileInput.trigger('click');
  };

  ColoringBook.prototype.loadNewImageOntoCanvas = function (imageSrc) {
    var self = this;
    var newImage = new Image();
    newImage.crossOrigin = 'Anonymous';
    newImage.onload = function () {
      self.historyStack = [];

      var naturalWidth = newImage.width;
      var naturalHeight = newImage.height;
      var targetCanvasWidth = self.canvas.width;
      var targetCanvasHeight = (naturalHeight / naturalWidth) * targetCanvasWidth;

      self.canvas.height = targetCanvasHeight;

      self.ctx.clearRect(0, 0, self.canvas.width, self.canvas.height);
      self.ctx.drawImage(newImage, 0, 0, self.canvas.width, self.canvas.height);
      self.originalImageData = self.ctx.getImageData(0, 0, self.canvas.width, self.canvas.height);
      self.pushCurrentStateToHistory();
      self.trigger('resize');
    };
    newImage.onerror = function () {
      self.showNotification(self.t('errorLoadingImage', 'Error loading image. Please check the file.'));
    };
    newImage.src = imageSrc;
  };

  ColoringBook.prototype.handleTextToolClick = function (x, y) {
    var self = this;
    this.showTextInput(x, y, function (text) {
      if (text && text.trim() !== '') {
        self.drawText(text.trim(), x, y);
        self.pushCurrentStateToHistory();
      }
    });
  };

  /**
   * Show an inline text input overlay instead of window.prompt().
   */
  ColoringBook.prototype.showTextInput = function (x, y, callback) {
    var self = this;
    // Remove any existing text input
    this.$container.find('.h5p-coloring-book-text-input-overlay').remove();

    var $overlay = H5P.jQuery('<div>').addClass('h5p-coloring-book-text-input-overlay');
    var $input = H5P.jQuery('<input>', {
      type: 'text',
      'class': 'h5p-coloring-book-text-input',
      placeholder: this.t('enterText', 'Enter text:')
    });
    var $okBtn = H5P.jQuery('<button>').addClass('h5p-coloring-book-text-ok').text('OK');
    var $cancelBtn = H5P.jQuery('<button>').addClass('h5p-coloring-book-text-cancel').text('Cancel');

    function finish(value) {
      $overlay.remove();
      callback(value);
    }

    $okBtn.on('click', function () { finish($input.val()); });
    $cancelBtn.on('click', function () { finish(null); });
    $input.on('keydown', function (e) {
      if (e.key === 'Enter') { finish($input.val()); }
      if (e.key === 'Escape') { finish(null); }
    });

    $overlay.append($input, $okBtn, $cancelBtn);
    self.$canvasContainer.append($overlay);
    $input.focus();
  };

  /**
   * Show a non-blocking notification message instead of alert().
   */
  ColoringBook.prototype.showNotification = function (message) {
    var $notification = H5P.jQuery('<div>')
      .addClass('h5p-coloring-book-notification')
      .text(message);
    this.$container.append($notification);
    setTimeout(function () {
      $notification.fadeOut(300, function () { $notification.remove(); });
    }, 3000);
  };

  ColoringBook.prototype.drawText = function (text, x, y) {
    this.ctx.font = '20px Arial';
    this.ctx.fillStyle = this.currentColor;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(text, x, y);
  };

  ColoringBook.prototype.updateUndoButtonState = function () {
    if (this.$undoButton) {
      if (this.historyStack.length > 1) {
        this.$undoButton.removeClass('disabled').attr('tabindex', 0).removeAttr('aria-disabled');
      } else {
        this.$undoButton.addClass('disabled').attr('tabindex', -1).attr('aria-disabled', 'true');
      }
    }
  };

  ColoringBook.prototype.toggleFullScreen = function () {
    if (H5P.isFullscreen) {
      H5P.exitFullScreen();
    } else {
      H5P.fullScreen(this.$container, this);
    }
  };

  return ColoringBook;
})();
