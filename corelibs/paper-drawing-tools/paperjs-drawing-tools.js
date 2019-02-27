function Croquis(imageDataList, properties) {
  var self = this;
  if (properties != null) for (var property in properties) self[property] = properties[property];
  var domElement = document.createElement('div');
  domElement.style.clear = 'both';
  domElement.style.setProperty('user-select', 'none');
  domElement.style.setProperty('-webkit-user-select', 'none');
  domElement.style.setProperty('-ms-user-select', 'none');
  domElement.style.setProperty('-moz-user-select', 'none');

  self.getDOMElement = function () {
    return domElement;
  };

  self.getRelativePosition = function (absoluteX, absoluteY) {
    var rect = domElement.getBoundingClientRect();
    return {
      x: absoluteX - rect.left,
      y: absoluteY - rect.top
    };
  };

  var eventListeners = {
    'ondown': [],
    'onmove': [],
    'onup': [],
    'ontick': [],
    'onchange': [],
    'onundo': [],
    'onredo': [],
    'ontool': [],
    'oncanvassize': [],
    'onlayeradd': [],
    'onlayerremove': [],
    'onlayerswap': [],
    'onlayerselect': []
  };

  function dispatchEvent(event, e) {
    event = event.toLowerCase();
    e = e || {};

    if (eventListeners.hasOwnProperty(event)) {
      eventListeners[event].forEach(function (listener) {
        listener.call(self, e);
      });
    } else throw 'don\'t support ' + event;
  }

  self.addEventListener = function (event, listener) {
    event = event.toLowerCase();

    if (eventListeners.hasOwnProperty(event)) {
      if (typeof listener !== 'function') throw listener + ' is not a function';
      eventListeners[event].push(listener);
    } else throw 'don\'t support ' + event;
  };

  self.removeEventListener = function (event, listener) {
    event = event.toLowerCase();

    if (eventListeners.hasOwnProperty(event)) {
      if (listener == null) {
        // remove all
        eventListeners[event] = [];
        return;
      }

      var listeners = eventListeners[event];
      var index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    } else throw 'don\'t support ' + event;
  };

  self.hasEventListener = function (event, listener) {
    event = event.toLowerCase();

    if (eventListeners.hasOwnProperty(event)) {
      if (listener == null) return eventListeners[event].length > 0;
      return eventListeners[event].indexOf(listener) >= 0;
    } else return false;
  };

  var undoStack = [];
  var redoStack = [];
  var undoLimit = 10;
  var preventPushUndo = false;
  var pushToTransaction = false;

  self.getUndoLimit = function () {
    return undoLimit;
  };

  self.setUndoLimit = function (limit) {
    undoLimit = limit;
  };

  self.lockHistory = function () {
    preventPushUndo = true;
  };

  self.unlockHistory = function () {
    preventPushUndo = false;
  };

  self.beginHistoryTransaction = function () {
    undoStack.push([]);
    pushToTransaction = true;
  };

  self.endHistoryTransaction = function () {
    pushToTransaction = false;
  };

  self.clearHistory = function () {
    if (preventPushUndo) throw 'history is locked';
    undoStack = [];
    redoStack = [];
  };

  function pushUndo(undoFunction) {
    dispatchEvent('onchange');
    if (self.onChanged) self.onChanged();
    if (preventPushUndo) return;
    redoStack = [];
    if (pushToTransaction) undoStack[undoStack.length - 1].push(undoFunction);else undoStack.push([undoFunction]);

    while (undoStack.length > undoLimit) undoStack.shift();
  }

  self.undo = function () {
    if (pushToTransaction) throw 'transaction is not ended';
    if (preventPushUndo) throw 'history is locked';
    if (isDrawing || isStabilizing) throw 'still drawing';
    if (undoStack.length == 0) throw 'no more undo data';
    var undoTransaction = undoStack.pop();
    var redoTransaction = [];

    while (undoTransaction.length) redoTransaction.push(undoTransaction.pop()());

    redoStack.push(redoTransaction);
    dispatchEvent('onundo');
  };

  self.redo = function () {
    if (pushToTransaction) throw 'transaction is not ended';
    if (preventPushUndo) throw 'history is locked';
    if (isDrawing || isStabilizing) throw 'still drawing';
    if (redoStack.length == 0) throw 'no more redo data';
    var redoTransaction = redoStack.pop();
    var undoTransaction = [];

    while (redoTransaction.length) undoTransaction.push(redoTransaction.pop()());

    undoStack.push(undoTransaction);
    dispatchEvent('onredo');
  };

  function pushLayerMetadataUndo(index) {
    index = index || layerIndex;
    var snapshotMetadata = self.getLayerMetadata(index);

    var swap = function () {
      self.lockHistory();
      var temp = self.getLayerMetadata(index);
      self.setLayerMetadata(snapshotMetadata, index);
      snapshotMetadata = temp;
      self.unlockHistory();
      return swap;
    };

    pushUndo(swap);
  }

  function pushLayerOpacityUndo(index) {
    index = index || layerIndex;
    var snapshotOpacity = self.getLayerOpacity(index);

    var swap = function () {
      self.lockHistory();
      var temp = self.getLayerOpacity(index);
      self.setLayerOpacity(snapshotOpacity, index);
      snapshotOpacity = temp;
      self.unlockHistory();
      return swap;
    };

    pushUndo(swap);
  }

  function pushLayerVisibleUndo(index) {
    index = index || layerIndex;
    var snapshotVisible = self.getLayerVisible(index);

    var swap = function () {
      self.lockHistory();
      var temp = self.getLayerVisible(index);
      self.setLayerVisible(snapshotVisible, index);
      snapshotVisible = temp;
      self.unlockHistory();
      return swap;
    };

    pushUndo(swap);
  }

  function pushSwapLayerUndo(layerA, layerB) {
    var swap = function () {
      self.lockHistory();
      self.swapLayer(layerA, layerB);
      self.unlockHistory();
      return swap;
    };

    pushUndo(swap);
  }

  function pushAddLayerUndo(index) {
    var add = function () {
      self.lockHistory();
      self.addLayer(index);
      self.unlockHistory();
      cacheLayer(index);
      return remove;
    };

    var remove = function () {
      self.lockHistory();
      self.removeLayer(index);
      self.unlockHistory();
      return add;
    };

    pushUndo(remove);
  }

  function pushRemoveLayerUndo(index) {
    var layerContext = getLayerContext(index);
    var w = size.width;
    var h = size.height;
    var snapshotData = layerContext.getImageData(0, 0, w, h);
    var snapshotMetadata = self.getLayerMetadata(index);
    var snapshotOpacity = self.getLayerOpacity(index);
    var snapshotVisible = self.getLayerVisible(index);

    var add = function () {
      self.lockHistory();
      self.addLayer(index);
      self.setLayerMetadata(snapshotMetadata, index);
      self.setLayerOpacity(snapshotOpacity, index);
      self.setLayerVisible(snapshotVisible, index);
      var layerContext = getLayerContext(index);
      layerContext.putImageData(snapshotData, 0, 0);
      self.unlockHistory();
      cacheLayer(index);
      return remove;
    };

    var remove = function () {
      self.lockHistory();
      self.removeLayer(index);
      self.unlockHistory();
      return add;
    };

    pushUndo(add);
  }

  function pushDirtyRectUndo(x, y, width, height, index) {
    index = index || layerIndex;
    var w = size.width;
    var h = size.height;
    var right = x + width;
    var bottom = y + height;
    x = Math.min(w, Math.max(0, x));
    y = Math.min(h, Math.max(0, y));
    width = Math.min(w, Math.max(x, right)) - x;
    height = Math.min(h, Math.max(y, bottom)) - y;
    if (x % 1 > 0) ++width;
    if (y % 1 > 0) ++height;
    x = x | 0;
    y = y | 0;
    width = Math.min(w - x, Math.ceil(width));
    height = Math.min(h - y, Math.ceil(height));

    if (width === 0 || height === 0) {
      var doNothing = function () {
        return doNothing;
      };

      pushUndo(doNothing);
    } else {
      var layerContext = getLayerContext(index);
      var snapshotData = layerContext.getImageData(x, y, width, height);

      var swap = function () {
        var layerContext = getLayerContext(index);
        var tempData = layerContext.getImageData(x, y, width, height);
        layerContext.putImageData(snapshotData, x, y);
        snapshotData = tempData;
        cacheLayer(index);
        return swap;
      };

      pushUndo(swap);
    }

    if (renderDirtyRect) drawDirtyRect(x, y, width, height);
  }

  function pushContextUndo(index) {
    index = index || layerIndex;
    pushDirtyRectUndo(0, 0, size.width, size.height, index);
  }

  function pushAllContextUndo() {
    var snapshotDatas = [];
    var i;
    var w = size.width;
    var h = size.height;

    for (i = 0; i < layers.length; ++i) {
      var layerContext = getLayerContext(i);
      snapshotDatas.push(layerContext.getImageData(0, 0, w, h));
    }

    var swap = function (index) {
      var layerContext = getLayerContext(index);
      var tempData = layerContext.getImageData(0, 0, w, h);
      layerContext.putImageData(snapshotDatas[index], 0, 0);
      snapshotDatas[index] = tempData;
      cacheLayer(index);
    };

    var swapAll = function () {
      for (var i = 0; i < layers.length; ++i) swap(i);

      return swapAll;
    };

    pushUndo(swapAll);
  }

  function pushCanvasSizeUndo(width, height, offsetX, offsetY) {
    var snapshotSize = self.getCanvasSize();
    var snapshotDatas = [];
    var w = snapshotSize.width;
    var h = snapshotSize.height;

    for (var i = 0; i < layers.length; ++i) {
      var layerContext = getLayerContext(i);
      snapshotDatas[i] = layerContext.getImageData(0, 0, w, h);
    }

    function setSize(width, height, offsetX, offsetY) {
      self.lockHistory();
      self.setCanvasSize(width, height, offsetX, offsetY);
      self.unlockHistory();
    }

    var rollback = function () {
      setSize(w, h);

      for (var i = 0; i < layers.length; ++i) {
        var layerContext = getLayerContext(i);
        layerContext.putImageData(snapshotDatas[i], 0, 0);
      }

      return redo;
    };

    var redo = function () {
      rollback();
      setSize(width, height, offsetX, offsetY);
      return rollback;
    };

    pushUndo(rollback);
  }

  var size = {
    width: 640,
    height: 480
  };

  self.getCanvasSize = function () {
    return {
      width: size.width,
      height: size.height
    }; //clone size
  };

  self.setCanvasSize = function (width, height, offsetX, offsetY) {
    offsetX = offsetX || 0;
    offsetY = offsetY || 0;
    size.width = width = Math.floor(width);
    size.height = height = Math.floor(height);
    pushCanvasSizeUndo(width, height, offsetX, offsetY);
    dispatchEvent('oncanvassize', {
      width: width,
      height: height,
      offsetX: offsetX,
      offsetY: offsetY
    });
    paintingCanvas.width = width;
    paintingCanvas.height = height;
    dirtyRectDisplay.width = width;
    dirtyRectDisplay.height = height;
    domElement.style.width = width + 'px';
    domElement.style.height = height + 'px';

    for (var i = 0; i < layers.length; ++i) {
      var canvas = getLayerCanvas(i);
      var context = getLayerContext(i);
      var imageData = context.getImageData(0, 0, width, height);
      canvas.width = width;
      canvas.height = height;
      context.putImageData(imageData, offsetX, offsetY);
    }
  };

  self.getCanvasWidth = function () {
    return size.width;
  };

  self.setCanvasWidth = function (width, offsetX) {
    self.setCanvasSize(width, size.height, offsetX, 0);
  };

  self.getCanvasHeight = function () {
    return size.height;
  };

  self.setCanvasHeight = function (height, offsetY) {
    self.setCanvasSize(size.width, height, 0, offsetY);
  };

  function getLayerCanvas(index) {
    return layers[index].getElementsByClassName('croquis-layer-canvas')[0];
  }

  self.getLayerCanvas = getLayerCanvas;

  function getLayerContext(index) {
    return getLayerCanvas(index).getContext('2d');
  }

  var layers = [];
  var layerIndex = 0;
  var paintingCanvas = document.createElement('canvas');
  var paintingContext = paintingCanvas.getContext('2d');
  paintingCanvas.className = 'croquis-painting-canvas';
  paintingCanvas.style.position = 'absolute';
  var dirtyRectDisplay = document.createElement('canvas');
  var dirtyRectDisplayContext = dirtyRectDisplay.getContext('2d');
  dirtyRectDisplay.className = 'croquis-dirty-rect-display';
  dirtyRectDisplay.style.position = 'absolute';
  var renderDirtyRect = false;

  function sortLayers() {
    while (domElement.firstChild) domElement.removeChild(domElement.firstChild);

    for (var i = 0; i < layers.length; ++i) {
      var layer = layers[i];
      domElement.appendChild(layer);
    }

    domElement.appendChild(dirtyRectDisplay);
  }

  function drawDirtyRect(x, y, w, h) {
    var context = dirtyRectDisplayContext;
    context.fillStyle = '#f00';
    context.globalCompositeOperation = 'source-over';
    context.fillRect(x, y, w, h);

    if (w > 2 && h > 2) {
      context.globalCompositeOperation = 'destination-out';
      context.fillRect(x + 1, y + 1, w - 2, h - 2);
    }
  }

  self.getRenderDirtyRect = function () {
    return renderDirtyRect;
  };

  self.setRenderDirtyRect = function (render) {
    renderDirtyRect = render;
    if (render == false) dirtyRectDisplayContext.clearRect(0, 0, size.width, size.height);
  };

  self.createLayerThumbnail = function (index, width, height) {
    index = index || layerIndex;
    width = width || size.width;
    height = height || size.height;
    var canvas = getLayerCanvas(index);
    var thumbnail = document.createElement('canvas');
    var thumbnailContext = thumbnail.getContext('2d');
    thumbnail.width = width;
    thumbnail.height = height;
    thumbnailContext.drawImage(canvas, 0, 0, width, height);
    return thumbnail;
  };

  self.createFlattenThumbnail = function (width, height) {
    width = width || size.width;
    height = height || size.height;
    var thumbnail = document.createElement('canvas');
    var thumbnailContext = thumbnail.getContext('2d');
    thumbnail.width = width;
    thumbnail.height = height;

    for (var i = 0; i < layers.length; ++i) {
      if (!self.getLayerVisible(i)) continue;
      var canvas = getLayerCanvas(i);
      thumbnailContext.globalAlpha = self.getLayerOpacity(i);
      thumbnailContext.drawImage(canvas, 0, 0, width, height);
    }

    return thumbnail;
  };

  self.getLayers = function () {
    return layers.concat(); //clone layers
  };

  self.getLayerCount = function () {
    return layers.length;
  };

  self.addLayer = function (index) {
    index = index || layers.length;
    pushAddLayerUndo(index);
    var layer = document.createElement('div');
    layer.className = 'croquis-layer';
    layer.style.visibility = 'visible';
    layer.style.opacity = 1;
    layer['croquis-metadata'] = {};
    var canvas = document.createElement('canvas');
    canvas.className = 'croquis-layer-canvas';
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.style.position = 'absolute';
    layer.appendChild(canvas);
    domElement.appendChild(layer);
    layers.splice(index, 0, layer);
    sortLayers();
    self.selectLayer(layerIndex);
    dispatchEvent('onlayeradd', {
      index: index
    });
    if (self.onLayerAdded) self.onLayerAdded(index);
    return layer;
  };

  self.removeLayer = function (index) {
    index = index || layerIndex;
    pushRemoveLayerUndo(index);
    domElement.removeChild(layers[index]);
    layers.splice(index, 1);
    if (layerIndex == layers.length) self.selectLayer(layerIndex - 1);
    sortLayers();
    dispatchEvent('onlayerremove', {
      index: index
    });
    if (self.onLayerRemoved) self.onLayerRemoved(index);
  };

  self.removeAllLayer = function () {
    while (layers.length) self.removeLayer(0);
  };

  self.swapLayer = function (layerA, layerB) {
    pushSwapLayerUndo(layerA, layerB);
    var layer = layers[layerA];
    layers[layerA] = layers[layerB];
    layers[layerB] = layer;
    sortLayers();
    dispatchEvent('onlayerswap', {
      a: layerA,
      b: layerB
    });
    if (self.onLayerSwapped) self.onLayerSwapped(layerA, layerB);
  };

  self.getCurrentLayerIndex = function () {
    return layerIndex;
  };

  self.selectLayer = function (index) {
    var lastestLayerIndex = layers.length - 1;
    if (index > lastestLayerIndex) index = lastestLayerIndex;
    layerIndex = index;
    if (paintingCanvas.parentElement != null) paintingCanvas.parentElement.removeChild(paintingCanvas);
    layers[index].appendChild(paintingCanvas);
    dispatchEvent('onlayerselect', {
      index: index
    });
    if (self.onLayerSelected) self.onLayerSelected(index);
  };

  self.clearLayer = function (index) {
    index = index || layerIndex;
    pushContextUndo(index);
    var context = getLayerContext(index);
    context.clearRect(0, 0, size.width, size.height);
    cacheLayer(index);
  };

  self.fillLayer = function (fillColor, index) {
    index = index || layerIndex;
    pushContextUndo(index);
    var context = getLayerContext(index);
    context.fillStyle = fillColor;
    context.fillRect(0, 0, size.width, size.height);
    cacheLayer(index);
  };

  self.fillLayerRect = function (fillColor, x, y, width, height, index) {
    index = index || layerIndex;
    pushDirtyRectUndo(x, y, width, height, index);
    var context = getLayerContext(index);
    context.fillStyle = fillColor;
    context.fillRect(x, y, width, height);
    cacheLayer(index);
  };

  self.floodFill = function (x, y, r, g, b, a, index) {
    index = index || layerIndex;
    pushContextUndo(index);
    var context = getLayerContext(index);
    var w = size.width;
    var h = size.height;
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    var imageData = context.getImageData(0, 0, w, h);
    var d = imageData.data;
    var targetColor = getColor(x, y);
    var replacementColor = r << 24 | g << 16 | b << 8 | a;
    if (targetColor === replacementColor) return;

    function getColor(x, y) {
      var index = (y * w + x) * 4;
      return d[index] << 24 | d[index + 1] << 16 | d[index + 2] << 8 | d[index + 3];
    }

    function setColor(x, y) {
      var index = (y * w + x) * 4;
      d[index] = r;
      d[index + 1] = g;
      d[index + 2] = b;
      d[index + 3] = a;
    }

    var queue = [];
    queue.push(x, y);

    while (queue.length) {
      var nx = queue.shift();
      var ny = queue.shift();
      if (nx < 0 || nx >= w || ny < 0 || ny >= h || getColor(nx, ny) !== targetColor) continue;
      var west, east;
      west = east = nx;

      do {
        var wc = getColor(--west, ny);
      } while (west >= 0 && wc === targetColor);

      do {
        var ec = getColor(++east, ny);
      } while (east < w && ec === targetColor);

      for (var i = west + 1; i < east; ++i) {
        setColor(i, ny);
        var north = ny - 1;
        var south = ny + 1;
        if (getColor(i, north) === targetColor) queue.push(i, north);
        if (getColor(i, south) === targetColor) queue.push(i, south);
      }
    }

    context.putImageData(imageData, 0, 0);
    cacheLayer(index);
  };

  self.getLayerMetadata = function (index) {
    index = index || layerIndex;
    var metadata = layers[index]['croquis-metadata'];
    var clone = {};
    Object.keys(metadata).forEach(function (key) {
      clone[key] = metadata[key];
    });
    return clone;
  };

  self.setLayerMetadata = function (metadata, index) {
    index = index || layerIndex;
    pushLayerMetadataUndo(index);
    layers[index]['croquis-metadata'] = metadata;
  };

  self.getLayerOpacity = function (index) {
    index = index || layerIndex;
    var opacity = parseFloat(layers[index].style.getPropertyValue('opacity'));
    return window.isNaN(opacity) ? 1 : opacity;
  };

  self.setLayerOpacity = function (opacity, index) {
    index = index || layerIndex;
    pushLayerOpacityUndo(index);
    layers[index].style.opacity = opacity;
  };

  self.getLayerVisible = function (index) {
    index = index || layerIndex;
    var visible = layers[index].style.getPropertyValue('visibility');
    return visible != 'hidden';
  };

  self.setLayerVisible = function (visible, index) {
    index = index || layerIndex;
    pushLayerVisibleUndo(index);
    layers[index].style.visibility = visible ? 'visible' : 'hidden';
  };

  function cacheLayer(index) {
    index = index || layerIndex;
    var w = size.width;
    var h = size.height;
    layers[index].cache = getLayerContext(index).getImageData(0, 0, w, h);
  }

  self.getLayerImageDataCache = function (index) {
    index = index || layerIndex;
    if (layers[index].cache == null) cacheLayer(index);
    return layers[index].cache;
  };

  function makeColorData(imageData1x1) {
    var data = imageData1x1.data;
    var r = data[0];
    var g = data[1];
    var b = data[2];
    var a = data[3];
    return {
      r: r,
      g: g,
      b: b,
      a: a,
      htmlColor: 'rgba(' + [r, g, b, a / 0xff].join(',') + ')'
    };
  }

  self.pickColor = function (x, y, index) {
    x = x | 0; // cast to int

    y = y | 0;
    if (x < 0 || x >= size.width || y < 0 || y >= size.height) return null;
    index = index || layerIndex;
    var cache = self.getLayerImageDataCache(index);
    var position = (y * size.width + x) * 4;
    var data = [];
    data[0] = cache.data[position];
    data[1] = cache.data[++position];
    data[2] = cache.data[++position];
    data[3] = cache.data[++position];
    return makeColorData({
      data: data
    });
  };

  self.eyeDrop = function (x, y, baseColor) {
    if (self.pickColor(x, y) == null) return null;
    baseColor = baseColor || '#fff';
    var plane = document.createElement('canvas');
    plane.width = 1;
    plane.height = 1;
    var planeContext = plane.getContext('2d');
    planeContext.fillStyle = baseColor;
    planeContext.fillRect(0, 0, 1, 1);

    for (var i = 0; i < layers.length; ++i) {
      if (!self.getLayerVisible(i)) continue;
      planeContext.globalAlpha = self.getLayerOpacity(i);
      planeContext.fillStyle = self.pickColor(x, y, i).htmlColor;
      planeContext.fillRect(0, 0, 1, 1);
    }

    return makeColorData(planeContext.getImageData(0, 0, 1, 1));
  };

  var tool;
  var toolStabilizeLevel = 0;
  var toolStabilizeWeight = 0.8;
  var stabilizer = null;
  var stabilizerInterval = 5;
  var tick;
  var tickInterval = 20;
  var paintingOpacity = 1;
  var paintingKnockout = false;

  self.getTool = function () {
    return tool;
  };

  self.setTool = function (value) {
    tool = value;
    dispatchEvent('ontool', {
      tool: value
    });
    paintingContext = paintingCanvas.getContext('2d');
    if (tool && tool.setContext) tool.setContext(paintingContext);
  };

  self.setTool(new Croquis.Brush());

  self.getPaintingOpacity = function () {
    return paintingOpacity;
  };

  self.setPaintingOpacity = function (opacity) {
    paintingOpacity = opacity;
    paintingCanvas.style.opacity = opacity;
  };

  self.getPaintingKnockout = function () {
    return paintingKnockout;
  };

  self.setPaintingKnockout = function (knockout) {
    if (isDrawing || isStabilizing) throw 'still drawing';
    paintingKnockout = knockout;
    paintingCanvas.style.visibility = knockout ? 'hidden' : 'visible';
  };

  self.getTickInterval = function () {
    return tickInterval;
  };

  self.setTickInterval = function (interval) {
    tickInterval = interval;
  };
  /*
  stabilize level is the number of coordinate tracker.
  higher stabilize level makes lines smoother.
  */


  self.getToolStabilizeLevel = function () {
    return toolStabilizeLevel;
  };

  self.setToolStabilizeLevel = function (level) {
    toolStabilizeLevel = level < 0 ? 0 : level;
  };
  /*
  higher stabilize weight makes trackers follow slower.
  */


  self.getToolStabilizeWeight = function () {
    return toolStabilizeWeight;
  };

  self.setToolStabilizeWeight = function (weight) {
    toolStabilizeWeight = weight;
  };

  self.getToolStabilizeInterval = function () {
    return stabilizerInterval;
  };

  self.setToolStabilizeInterval = function (interval) {
    stabilizerInterval = interval;
  };

  var isDrawing = false;
  var isStabilizing = false;
  var beforeKnockout = document.createElement('canvas');
  var knockoutTick;
  var knockoutTickInterval = 20;

  function gotoBeforeKnockout() {
    var context = getLayerContext(layerIndex);
    var w = size.width;
    var h = size.height;
    context.clearRect(0, 0, w, h);
    context.drawImage(beforeKnockout, 0, 0, w, h);
  }

  function drawPaintingCanvas() {
    //draw painting canvas on current layer
    var context = getLayerContext(layerIndex);
    var w = size.width;
    var h = size.height;
    context.save();
    context.globalAlpha = paintingOpacity;
    context.globalCompositeOperation = paintingKnockout ? 'destination-out' : 'source-over';
    context.drawImage(paintingCanvas, 0, 0, w, h);
    context.restore();
  }

  function _move(x, y, pressure) {
    if (tool.move) tool.move(x, y, pressure);
    dispatchEvent('onmove', {
      x: x,
      y: y,
      pressure: pressure
    });
    if (self.onMoved) self.onMoved(x, y, pressure);
  }

  function _up(x, y, pressure) {
    isDrawing = false;
    isStabilizing = false;
    var dirtyRect;
    if (tool.up) dirtyRect = tool.up(x, y, pressure);
    if (paintingKnockout) gotoBeforeKnockout();
    if (dirtyRect) pushDirtyRectUndo(dirtyRect.x, dirtyRect.y, dirtyRect.width, dirtyRect.height);else pushContextUndo();
    drawPaintingCanvas();
    paintingContext.clearRect(0, 0, size.width, size.height);
    dirtyRect = dirtyRect || {
      x: 0,
      y: 0,
      width: size.width,
      height: size.height
    };
    dispatchEvent('onup', {
      x: x,
      y: y,
      pressure: pressure,
      dirtyRect: dirtyRect
    });
    if (self.onUpped) self.onUpped(x, y, pressure, dirtyRect);
    window.clearInterval(knockoutTick);
    window.clearInterval(tick);
    cacheLayer(self.getCurrentLayerIndex());
  }

  self.down = function (x, y, pressure) {
    if (isDrawing || isStabilizing) throw 'still drawing';
    isDrawing = true;
    if (tool == null) return;

    if (paintingKnockout) {
      var w = size.width;
      var h = size.height;
      var canvas = getLayerCanvas(layerIndex);
      var beforeKnockoutContext = beforeKnockout.getContext('2d');
      beforeKnockout.width = w;
      beforeKnockout.height = h;
      beforeKnockoutContext.clearRect(0, 0, w, h);
      beforeKnockoutContext.drawImage(canvas, 0, 0, w, h);
    }

    pressure = pressure || Croquis.Tablet.pressure();
    var down = tool.down;

    if (toolStabilizeLevel > 0) {
      stabilizer = new Croquis.Stabilizer(down, _move, _up, toolStabilizeLevel, toolStabilizeWeight, x, y, pressure, stabilizerInterval);
      isStabilizing = true;
    } else if (down != null) down(x, y, pressure);

    dispatchEvent('ondown', {
      x: x,
      y: y,
      pressure: pressure
    });
    if (self.onDowned) self.onDowned(x, y, pressure);
    knockoutTick = window.setInterval(function () {
      if (paintingKnockout) {
        gotoBeforeKnockout();
        drawPaintingCanvas();
      }
    }, knockoutTickInterval);
    tick = window.setInterval(function () {
      if (tool.tick) tool.tick();
      dispatchEvent('ontick');
      if (self.onTicked) self.onTicked();
    }, tickInterval);
  };

  self.move = function (x, y, pressure) {
    if (!isDrawing) throw 'you need to call \'down\' first';
    if (tool == null) return;
    pressure = pressure || Croquis.Tablet.pressure();
    if (stabilizer != null) stabilizer.move(x, y, pressure);else if (!isStabilizing) _move(x, y, pressure);
  };

  self.up = function (x, y, pressure) {
    if (!isDrawing) throw 'you need to call \'down\' first';

    if (tool == null) {
      isDrawing = false;
      return;
    }

    pressure = pressure || Croquis.Tablet.pressure();
    if (stabilizer != null) stabilizer.up(x, y, pressure);else _up(x, y, pressure);
    stabilizer = null;
  }; // apply image data


  ;
  (function (croquis, imageDataList) {
    if (imageDataList != null) {
      if (imageDataList.length === 0) return;
      croquis.lockHistory();
      var first = imageDataList[0];
      croquis.setCanvasSize(first.width, first.height);

      for (var i = 0; i < imageDataList.length; ++i) {
        var current = imageDataList[i];
        if (current.width != first.width || current.height != first.height) throw 'all image data must have same size';
        croquis.addLayer();
        var context = croquis.getLayerCanvas(i).getContext('2d');
        context.putImageData(current, 0, 0);
      }

      croquis.selectLayer(0);
      croquis.unlockHistory();
    }
  }).call(null, self, imageDataList);
}

Croquis.createChecker = function (cellSize, colorA, colorB) {
  cellSize = cellSize || 10;
  colorA = colorA || '#fff';
  colorB = colorB || '#ccc';
  var size = cellSize + cellSize;
  var checker = document.createElement('canvas');
  checker.width = checker.height = size;
  var context = checker.getContext('2d');
  context.fillStyle = colorB;
  context.fillRect(0, 0, size, size);
  context.fillStyle = colorA;
  context.fillRect(0, 0, cellSize, cellSize);
  context.fillRect(cellSize, cellSize, size, size);
  return checker;
};

Croquis.createBrushPointer = function (brushImage, brushSize, brushAngle, threshold, antialias, color, shadow, shadowOffsetX, shadowOffsetY) {
  brushSize = brushSize | 0;
  var pointer = document.createElement('canvas');
  var pointerContext = pointer.getContext('2d');
  var boundWidth;
  var boundHeight;

  if (brushSize === 0) {
    pointer.width = boundWidth = 1;
    pointer.height = boundHeight = 1;
  }

  if (brushImage == null) {
    var halfSize = brushSize * 0.5 | 0;
    pointer.width = boundWidth = brushSize;
    pointer.height = boundHeight = brushSize;
    pointerContext.fillStyle = '#000';
    pointerContext.beginPath();
    pointerContext.arc(halfSize, halfSize, halfSize, 0, Math.PI * 2);
    pointerContext.closePath();
    pointerContext.fill();
  } else {
    var width = brushSize;
    var height = brushSize * (brushImage.height / brushImage.width);
    var toRad = Math.PI / 180;
    var ra = brushAngle * toRad;
    var abs = Math.abs;
    var sin = Math.sin;
    var cos = Math.cos;
    boundWidth = abs(height * sin(ra)) + abs(width * cos(ra));
    boundHeight = abs(width * sin(ra)) + abs(height * cos(ra));
    pointer.width = boundWidth;
    pointer.height = boundHeight;
    pointerContext.save();
    pointerContext.translate(boundWidth * 0.5, boundHeight * 0.5);
    pointerContext.rotate(ra);
    pointerContext.translate(width * -0.5, height * -0.5);
    pointerContext.drawImage(brushImage, 0, 0, width, height);
    pointerContext.restore();
  }

  var result;
  var alphaThresholdBorder = Croquis.createAlphaThresholdBorder(pointer, threshold, antialias, color);

  if (shadow) {
    shadowOffsetX = shadowOffsetX || 1;
    shadowOffsetY = shadowOffsetY || 1;
    result = document.createElement('canvas');
    result.width = boundWidth + shadowOffsetX;
    result.height = boundHeight + shadowOffsetY;
    var resultContext = result.getContext('2d');
    resultContext.shadowOffsetX = shadowOffsetX;
    resultContext.shadowOffsetY = shadowOffsetY;
    resultContext.shadowColor = shadow;
    resultContext.drawImage(alphaThresholdBorder, 0, 0, boundWidth, boundHeight);
  } else {
    result = alphaThresholdBorder;
  }

  return result;
};

Croquis.createAlphaThresholdBorder = function (image, threshold, antialias, color) {
  threshold = threshold || 0x80;
  color = color || '#000';
  var width = image.width;
  var height = image.height;
  var canvas = document.createElement('canvas');
  var context = canvas.getContext('2d');
  canvas.width = width;
  canvas.height = height;

  try {
    context.drawImage(image, 0, 0, width, height);
  } catch (e) {
    return canvas;
  }

  var imageData = context.getImageData(0, 0, width, height);
  var d = imageData.data;

  function getAlphaIndex(index) {
    return d[index * 4 + 3];
  }

  function setRedIndex(index, red) {
    d[index * 4] = red;
  }

  function getRedXY(x, y) {
    var red = d[(y * width + x) * 4];
    return red || 0;
  }

  function getGreenXY(x, y) {
    var green = d[(y * width + x) * 4 + 1];
    return green;
  }

  function setColorXY(x, y, red, green, alpha) {
    var i = (y * width + x) * 4;
    d[i] = red;
    d[i + 1] = green;
    d[i + 2] = 0;
    d[i + 3] = alpha;
  } //threshold


  var pixelCount = d.length * 0.25 | 0;

  for (var i = 0; i < pixelCount; ++i) setRedIndex(i, getAlphaIndex(i) < threshold ? 0 : 1); //outline


  var x;
  var y;

  for (x = 0; x < width; ++x) {
    for (y = 0; y < height; ++y) {
      if (!getRedXY(x, y)) {
        setColorXY(x, y, 0, 0, 0);
      } else {
        var redCount = 0;
        var left = x - 1;
        var right = x + 1;
        var up = y - 1;
        var down = y + 1;
        redCount += getRedXY(left, up);
        redCount += getRedXY(left, y);
        redCount += getRedXY(left, down);
        redCount += getRedXY(right, up);
        redCount += getRedXY(right, y);
        redCount += getRedXY(right, down);
        redCount += getRedXY(x, up);
        redCount += getRedXY(x, down);
        if (redCount != 8) setColorXY(x, y, 1, 1, 255);else setColorXY(x, y, 1, 0, 0);
      }
    }
  } //antialias


  if (antialias) {
    for (x = 0; x < width; ++x) {
      for (y = 0; y < height; ++y) {
        if (getGreenXY(x, y)) {
          var alpha = 0;
          if (getGreenXY(x - 1, y) != getGreenXY(x + 1, y)) setColorXY(x, y, 1, 1, alpha += 0x40);
          if (getGreenXY(x, y - 1) != getGreenXY(x, y + 1)) setColorXY(x, y, 1, 1, alpha + 0x50);
        }
      }
    }
  }

  context.putImageData(imageData, 0, 0);
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
  return canvas;
};

Croquis.createFloodFill = function (canvas, x, y, r, g, b, a) {
  var result = document.createElement('canvas');
  var w = result.width = canvas.width;
  var h = result.height = canvas.height;
  if (x < 0 || x >= w || y < 0 || y >= h || !(r || g || b || a)) return result;
  var originalContext = canvas.getContext('2d');
  var originalData = originalContext.getImageData(0, 0, w, h);
  var od = originalData.data;
  var resultContext = result.getContext('2d');
  var resultData = resultContext.getImageData(0, 0, w, h);
  var rd = resultData.data;
  var targetColor = getColor(x, y);
  var replacementColor = r << 24 | g << 16 | b << 8 | a;

  function getColor(x, y) {
    var index = (y * w + x) * 4;
    return rd[index] ? replacementColor : od[index] << 24 | od[index + 1] << 16 | od[index + 2] << 8 | od[index + 3];
  }

  var queue = [];
  queue.push(x, y);

  while (queue.length) {
    var nx = queue.shift();
    var ny = queue.shift();
    if (nx < 0 || nx >= w || ny < 0 || ny >= h || getColor(nx, ny) !== targetColor) continue;
    var west, east;
    west = east = nx;

    do {
      var wc = getColor(--west, ny);
    } while (west >= 0 && wc === targetColor);

    do {
      var ec = getColor(++east, ny);
    } while (east < w && ec === targetColor);

    for (var i = west + 1; i < east; ++i) {
      rd[(ny * w + i) * 4] = 1;
      var north = ny - 1;
      var south = ny + 1;
      if (getColor(i, north) === targetColor) queue.push(i, north);
      if (getColor(i, south) === targetColor) queue.push(i, south);
    }
  }

  for (var i = 0; i < w; ++i) {
    for (var j = 0; j < h; ++j) {
      var index = (j * w + i) * 4;
      if (rd[index] === 0) continue;
      rd[index] = r;
      rd[index + 1] = g;
      rd[index + 2] = b;
      rd[index + 3] = a;
    }
  }

  resultContext.putImageData(resultData, 0, 0);
  return result;
};

Croquis.Tablet = {};

Croquis.Tablet.plugin = function () {
  var plugin = document.querySelector('object[type=\'application/x-wacomtabletplugin\']');

  if (!plugin) {
    plugin = document.createElement('object');
    plugin.type = 'application/x-wacomtabletplugin';
    plugin.style.position = 'absolute';
    plugin.style.top = '-1000px';
    document.body.appendChild(plugin);
  }

  return plugin;
};

Croquis.Tablet.pen = function () {
  var plugin = Croquis.Tablet.plugin();
  return plugin.penAPI;
};

Croquis.Tablet.pressure = function () {
  var pen = Croquis.Tablet.pen();
  return pen && pen.pointerType ? pen.pressure : 1;
};

Croquis.Tablet.isEraser = function () {
  var pen = Croquis.Tablet.pen();
  return pen ? pen.isEraser : false;
};

Croquis.Stabilizer = function (down, move, up, level, weight, x, y, pressure, interval) {
  interval = interval || 5;
  var follow = 1 - Math.min(0.95, Math.max(0, weight));
  var paramTable = [];
  var current = {
    x: x,
    y: y,
    pressure: pressure
  };

  for (var i = 0; i < level; ++i) paramTable.push({
    x: x,
    y: y,
    pressure: pressure
  });

  var first = paramTable[0];
  var last = paramTable[paramTable.length - 1];
  var upCalled = false;
  if (down != null) down(x, y, pressure);
  window.setTimeout(_move, interval);

  this.getParamTable = function () {
    //for test
    return paramTable;
  };

  this.move = function (x, y, pressure) {
    current.x = x;
    current.y = y;
    current.pressure = pressure;
  };

  this.up = function (x, y, pressure) {
    current.x = x;
    current.y = y;
    current.pressure = pressure;
    upCalled = true;
  };

  function dlerp(a, d, t) {
    return a + d * t;
  }

  function _move(justCalc) {
    var curr;
    var prev;
    var dx;
    var dy;
    var dp;
    var delta = 0;
    first.x = current.x;
    first.y = current.y;
    first.pressure = current.pressure;

    for (var i = 1; i < paramTable.length; ++i) {
      curr = paramTable[i];
      prev = paramTable[i - 1];
      dx = prev.x - curr.x;
      dy = prev.y - curr.y;
      dp = prev.pressure - curr.pressure;
      delta += Math.abs(dx);
      delta += Math.abs(dy);
      curr.x = dlerp(curr.x, dx, follow);
      curr.y = dlerp(curr.y, dy, follow);
      curr.pressure = dlerp(curr.pressure, dp, follow);
    }

    if (justCalc) return delta;

    if (upCalled) {
      while (delta > 1) {
        move(last.x, last.y, last.pressure);
        delta = _move(true);
      }

      up(last.x, last.y, last.pressure);
    } else {
      move(last.x, last.y, last.pressure);
      window.setTimeout(_move, interval);
    }
  }
};

Croquis.Random = {};

Croquis.Random.LFSR113 = function (seed) {
  var IA = 16807;
  var IM = 2147483647;
  var IQ = 127773;
  var IR = 2836;
  var a, b, c, d, e;

  this.get = function () {
    var f = (a << 6 ^ a) >> 13;
    a = (a & 4294967294) << 18 ^ f;
    f = (b << 2 ^ b) >> 27;
    b = (b & 4294967288) << 2 ^ f;
    f = (c << 13 ^ c) >> 21;
    c = (c & 4294967280) << 7 ^ f;
    f = (d << 3 ^ d) >> 12;
    d = (d & 4294967168) << 13 ^ f;
    return (a ^ b ^ c ^ d) * 2.3283064365386963e-10 + 0.5;
  };

  seed |= 0;
  if (seed <= 0) seed = 1;
  e = seed / IQ | 0;
  seed = (IA * (seed - (e * IQ | 0)) | 0) - (IR * e | 0) | 0;
  if (seed < 0) seed = seed + IM | 0;
  if (seed < 2) a = seed + 2 | 0;else a = seed;
  e = seed / IQ | 0;
  seed = (IA * (seed - (e * IQ | 0)) | 0) - (IR * e | 0) | 0;
  if (seed < 0) seed = seed + IM | 0;
  if (seed < 8) b = seed + 8 | 0;else b = seed;
  e = seed / IQ | 0;
  seed = (IA * (seed - (e * IQ | 0)) | 0) - (IR * e | 0) | 0;
  if (seed < 0) seed = seed + IM | 0;
  if (seed < 16) c = seed + 16 | 0;else c = seed;
  e = seed / IQ | 0;
  seed = (IA * (seed - (e * IQ | 0)) | 0) - (IR * e | 0) | 0;
  if (seed < 0) seed = seed + IM | 0;
  if (seed < 128) d = seed + 128 | 0;else d = seed;
  this.get();
};

Croquis.Brush = function () {
  // math shortcut
  var min = Math.min;
  var max = Math.max;
  var abs = Math.abs;
  var sin = Math.sin;
  var cos = Math.cos;
  var sqrt = Math.sqrt;
  var atan2 = Math.atan2;
  var PI = Math.PI;
  var ONE = PI + PI;
  var QUARTER = PI * 0.5;
  var random = Math.random;

  this.setRandomFunction = function (value) {
    random = value;
  };

  this.clone = function () {
    var clone = new Brush(context);
    clone.setColor(this.getColor());
    clone.setFlow(this.getFlow());
    clone.setSize(this.getSize());
    clone.setSpacing(this.getSpacing());
    clone.setAngle(this.getAngle());
    clone.setRotateToDirection(this.getRotateToDirection());
    clone.setNormalSpread(this.getNormalSpread());
    clone.setTangentSpread(this.getTangentSpread());
    clone.setImage(this.getImage());
  };

  var context = null;

  this.getContext = function () {
    return context;
  };

  this.setContext = function (value) {
    context = value;
  };

  var color = '#000';

  this.getColor = function () {
    return color;
  };

  this.setColor = function (value) {
    color = value;
    transformedImageIsDirty = true;
  };

  var flow = 1;

  this.getFlow = function () {
    return flow;
  };

  this.setFlow = function (value) {
    flow = value;
    transformedImageIsDirty = true;
  };

  var size = 10;

  this.getSize = function () {
    return size;
  };

  this.setSize = function (value) {
    size = value < 1 ? 1 : value;
    transformedImageIsDirty = true;
  };

  var spacing = 0.2;

  this.getSpacing = function () {
    return spacing;
  };

  this.setSpacing = function (value) {
    spacing = value < 0.01 ? 0.01 : value;
  };

  var toRad = PI / 180;
  var toDeg = 1 / toRad;
  var angle = 0; // radian unit

  this.getAngle = function () {
    // returns degree unit
    return angle * toDeg;
  };

  this.setAngle = function (value) {
    angle = value * toRad;
  };

  var rotateToDirection = false;

  this.getRotateToDirection = function () {
    return rotateToDirection;
  };

  this.setRotateToDirection = function (value) {
    rotateToDirection = value;
  };

  var normalSpread = 0;

  this.getNormalSpread = function () {
    return normalSpread;
  };

  this.setNormalSpread = function (value) {
    normalSpread = value;
  };

  var tangentSpread = 0;

  this.getTangentSpread = function () {
    return tangentSpread;
  };

  this.setTangentSpread = function (value) {
    tangentSpread = value;
  };

  var image = null;
  var transformedImage = null;
  var transformedImageIsDirty = true;
  var imageRatio = 1;

  this.getImage = function () {
    return image;
  };

  this.setImage = function (value) {
    if (value == null) {
      transformedImage = image = null;
      imageRatio = 1;
      drawFunction = drawCircle;
    } else if (value != image) {
      image = value;
      imageRatio = image.height / image.width;
      transformedImage = document.createElement('canvas');
      drawFunction = drawImage;
      transformedImageIsDirty = true;
    }
  };

  var delta = 0;
  var prevX = 0;
  var prevY = 0;
  var lastX = 0;
  var lastY = 0;
  var dir = 0;
  var prevScale = 0;
  var drawFunction = drawCircle;
  var reserved = null;
  var dirtyRect;

  function spreadRandom() {
    return random() - 0.5;
  }

  function drawReserved() {
    if (reserved != null) {
      drawTo(reserved.x, reserved.y, reserved.scale);
      reserved = null;
    }
  }

  function appendDirtyRect(x, y, width, height) {
    if (!(width && height)) return;
    var dxw = dirtyRect.x + dirtyRect.width;
    var dyh = dirtyRect.y + dirtyRect.height;
    var xw = x + width;
    var yh = y + height;
    var minX = dirtyRect.width ? min(dirtyRect.x, x) : x;
    var minY = dirtyRect.height ? min(dirtyRect.y, y) : y;
    dirtyRect.x = minX;
    dirtyRect.y = minY;
    dirtyRect.width = max(dxw, xw) - minX;
    dirtyRect.height = max(dyh, yh) - minY;
  }

  function transformImage() {
    transformedImage.width = size;
    transformedImage.height = size * imageRatio;
    var brushContext = transformedImage.getContext('2d');
    brushContext.clearRect(0, 0, transformedImage.width, transformedImage.height);
    brushContext.drawImage(image, 0, 0, transformedImage.width, transformedImage.height);
    brushContext.globalCompositeOperation = 'source-in';
    brushContext.fillStyle = color;
    brushContext.globalAlpha = flow;
    brushContext.fillRect(0, 0, transformedImage.width, transformedImage.height);
  }

  function drawCircle(size) {
    var halfSize = size * 0.5;
    context.fillStyle = color;
    context.globalAlpha = flow;
    context.beginPath();
    context.arc(halfSize, halfSize, halfSize, 0, ONE);
    context.closePath();
    context.fill();
  }

  function drawImage(size) {
    if (transformedImageIsDirty) transformImage();

    try {
      context.drawImage(transformedImage, 0, 0, size, size * imageRatio);
    } catch (e) {
      drawCircle(size);
    }
  }

  function drawTo(x, y, scale) {
    var scaledSize = size * scale;
    var nrm = dir + QUARTER;
    var nr = normalSpread * scaledSize * spreadRandom();
    var tr = tangentSpread * scaledSize * spreadRandom();
    var ra = rotateToDirection ? angle + dir : angle;
    var width = scaledSize;
    var height = width * imageRatio;
    var boundWidth = abs(height * sin(ra)) + abs(width * cos(ra));
    var boundHeight = abs(width * sin(ra)) + abs(height * cos(ra));
    x += Math.cos(nrm) * nr + Math.cos(dir) * tr;
    y += Math.sin(nrm) * nr + Math.sin(dir) * tr;
    context.save();
    context.translate(x, y);
    context.rotate(ra);
    context.translate(-(width * 0.5), -(height * 0.5));
    drawFunction(width);
    context.restore();
    appendDirtyRect(x - boundWidth * 0.5, y - boundHeight * 0.5, boundWidth, boundHeight);
  }

  this.down = function (x, y, scale) {
    if (context == null) throw 'brush needs the context';
    dir = 0;
    dirtyRect = {
      x: 0,
      y: 0,
      width: 0,
      height: 0
    };

    if (scale > 0) {
      if (rotateToDirection || normalSpread !== 0 || tangentSpread !== 0) reserved = {
        x: x,
        y: y,
        scale: scale
      };else drawTo(x, y, scale);
    }

    delta = 0;
    lastX = prevX = x;
    lastY = prevY = y;
    prevScale = scale;
  };

  this.move = function (x, y, scale) {
    if (context == null) throw 'brush needs the context';

    if (scale <= 0) {
      delta = 0;
      prevX = x;
      prevY = y;
      prevScale = scale;
      return;
    }

    var dx = x - prevX;
    var dy = y - prevY;
    var ds = scale - prevScale;
    var d = sqrt(dx * dx + dy * dy);
    prevX = x;
    prevY = y;
    delta += d;
    var midScale = (prevScale + scale) * 0.5;
    var drawSpacing = size * spacing * midScale;
    var ldx = x - lastX;
    var ldy = y - lastY;
    var ld = sqrt(ldx * ldx + ldy * ldy);
    dir = atan2(ldy, ldx);
    if (ldx || ldy) drawReserved();
    if (drawSpacing < 0.5) drawSpacing = 0.5;

    if (delta < drawSpacing) {
      prevScale = scale;
      return;
    }

    var scaleSpacing = ds * (drawSpacing / delta);

    if (ld < drawSpacing) {
      lastX = x;
      lastY = y;
      drawTo(lastX, lastY, scale);
      delta -= drawSpacing;
    } else {
      while (delta >= drawSpacing) {
        ldx = x - lastX;
        ldy = y - lastY;
        var tx = cos(dir);
        var ty = sin(dir);
        lastX += tx * drawSpacing;
        lastY += ty * drawSpacing;
        prevScale += scaleSpacing;
        drawTo(lastX, lastY, prevScale);
        delta -= drawSpacing;
      }
    }

    prevScale = scale;
  };

  this.up = function (x, y, scale) {
    dir = atan2(y - lastY, x - lastX);
    drawReserved();
    return dirtyRect;
  };
};
var floodfill = function () {
  function f(p, v, u, l, t, g, B) {
    var k = p.length;
    var q = [];
    var o = (v + u * g) * 4;
    var r = o,
        z = o,
        s,
        A,
        n = g * 4;
    var h = [p[o], p[o + 1], p[o + 2], p[o + 3]];

    if (!a(o, h, l, p, k, t)) {
      return false;
    }

    q.push(o);

    while (q.length) {
      o = q.pop();

      if (e(o, h, l, p, k, t)) {
        r = o;
        z = o;
        A = parseInt(o / n) * n;
        s = A + n;

        while (A < z && A < (z -= 4) && e(z, h, l, p, k, t)) {}

        while (s > r && s > (r += 4) && e(r, h, l, p, k, t)) {}

        for (var m = z + 4; m < r; m += 4) {
          if (m - n >= 0 && a(m - n, h, l, p, k, t)) {
            q.push(m - n);
          }

          if (m + n < k && a(m + n, h, l, p, k, t)) {
            q.push(m + n);
          }
        }
      }
    }

    return p;
  }

  function a(j, l, h, m, k, g) {
    if (j < 0 || j >= k) {
      return false;
    }

    if (m[j + 3] === 0 && h.a > 0) {
      return true;
    }

    if (Math.abs(l[3] - h.a) <= g && Math.abs(l[0] - h.r) <= g && Math.abs(l[1] - h.g) <= g && Math.abs(l[2] - h.b) <= g) {
      return false;
    }

    if (l[3] === m[j + 3] && l[0] === m[j] && l[1] === m[j + 1] && l[2] === m[j + 2]) {
      return true;
    }

    if (Math.abs(l[3] - m[j + 3]) <= 255 - g && Math.abs(l[0] - m[j]) <= g && Math.abs(l[1] - m[j + 1]) <= g && Math.abs(l[2] - m[j + 2]) <= g) {
      return true;
    }

    return false;
  }

  function e(j, l, h, m, k, g) {
    if (a(j, l, h, m, k, g)) {
      m[j] = h.r;
      m[j + 1] = h.g;
      m[j + 2] = h.b;
      m[j + 3] = h.a;
      return true;
    }

    return false;
  }

  function b(j, n, m, i, k, g, o) {
    if (!j instanceof Uint8ClampedArray) {
      throw new Error("data must be an instance of Uint8ClampedArray");
    }

    if (isNaN(g) || g < 1) {
      throw new Error("argument 'width' must be a positive integer");
    }

    if (isNaN(o) || o < 1) {
      throw new Error("argument 'height' must be a positive integer");
    }

    if (isNaN(n) || n < 0) {
      throw new Error("argument 'x' must be a positive integer");
    }

    if (isNaN(m) || m < 0) {
      throw new Error("argument 'y' must be a positive integer");
    }

    if (g * o * 4 !== j.length) {
      throw new Error("width and height do not fit Uint8ClampedArray dimensions");
    }

    var l = Math.floor(n);
    var h = Math.floor(m);

    if (l !== n) {
      console.warn("x truncated from", n, "to", l);
    }

    if (h !== m) {
      console.warn("y truncated from", m, "to", h);
    }

    k = !isNaN(k) ? Math.min(Math.abs(Math.round(k)), 254) : 0;
    return f(j, l, h, i, k, g, o);
  }

  var d = function (l) {
    var h = document.createElement("div");
    var g = {
      r: 0,
      g: 0,
      b: 0,
      a: 0
    };
    h.style.color = l;
    h.style.display = "none";
    document.body.appendChild(h);
    var i = window.getComputedStyle(h, null).color;
    document.body.removeChild(h);
    var k = /([\.\d]+)/g;
    var j = i.match(k);

    if (j && j.length > 2) {
      g.r = parseInt(j[0]) || 0;
      g.g = parseInt(j[1]) || 0;
      g.b = parseInt(j[2]) || 0;
      g.a = Math.round((parseFloat(j[3]) || 1) * 255);
    }

    return g;
  };

  function c(p, n, m, i, o, q, g) {
    var s = this;
    var k = d(this.fillStyle);
    i = isNaN(i) ? 0 : i;
    o = isNaN(o) ? 0 : o;
    q = !isNaN(q) && q ? Math.min(Math.abs(q), s.canvas.width) : s.canvas.width;
    g = !isNaN(g) && g ? Math.min(Math.abs(g), s.canvas.height) : s.canvas.height;
    var j = s.getImageData(i, o, q, g);
    var l = j.data;
    var h = j.width;
    var r = j.height;

    if (h > 0 && r > 0) {
      b(l, p, n, k, m, h, r);
      s.putImageData(j, i, o);
    }
  }

  if (typeof CanvasRenderingContext2D != "undefined") {
    CanvasRenderingContext2D.prototype.fillFlood = c;
  }

  return b;
}();
/*! @license MIT. https://github.com/onury/invert-color */
!function (e, t) {
  "object" == typeof exports && "object" == typeof module ? module.exports = t() : "function" == typeof define && define.amd ? define("invert", [], t) : "object" == typeof exports ? exports.invert = t() : e.invert = t();
}(this, function () {
  return function (e) {
    var t = {};

    function r(n) {
      if (t[n]) return t[n].exports;
      var o = t[n] = {
        i: n,
        l: !1,
        exports: {}
      };
      return e[n].call(o.exports, o, o.exports, r), o.l = !0, o.exports;
    }

    return r.m = e, r.c = t, r.d = function (e, t, n) {
      r.o(e, t) || Object.defineProperty(e, t, {
        enumerable: !0,
        get: n
      });
    }, r.r = function (e) {
      "undefined" != typeof Symbol && Symbol.toStringTag && Object.defineProperty(e, Symbol.toStringTag, {
        value: "Module"
      }), Object.defineProperty(e, "__esModule", {
        value: !0
      });
    }, r.t = function (e, t) {
      if (1 & t && (e = r(e)), 8 & t) return e;
      if (4 & t && "object" == typeof e && e && e.__esModule) return e;
      var n = Object.create(null);
      if (r.r(n), Object.defineProperty(n, "default", {
        enumerable: !0,
        value: e
      }), 2 & t && "string" != typeof e) for (var o in e) r.d(n, o, function (t) {
        return e[t];
      }.bind(null, o));
      return n;
    }, r.n = function (e) {
      var t = e && e.__esModule ? function () {
        return e.default;
      } : function () {
        return e;
      };
      return r.d(t, "a", t), t;
    }, r.o = function (e, t) {
      return Object.prototype.hasOwnProperty.call(e, t);
    }, r.p = "lib/", r(r.s = 0);
  }([function (e, t, r) {
    "use strict";

    Object.defineProperty(t, "__esModule", {
      value: !0
    });
    var n = Math.sqrt(1.05 * .05) - .05,
        o = /^(?:[0-9a-f]{3}){1,2}$/i,
        i = {
      black: "#000000",
      white: "#ffffff"
    };

    function u(e) {
      if ("#" === e.slice(0, 1) && (e = e.slice(1)), !o.test(e)) throw new Error('Invalid HEX color: "' + e + '"');
      return 3 === e.length && (e = e[0] + e[0] + e[1] + e[1] + e[2] + e[2]), [parseInt(e.slice(0, 2), 16), parseInt(e.slice(2, 4), 16), parseInt(e.slice(4, 6), 16)];
    }

    function f(e) {
      if (!e) throw new Error("Invalid color value");
      return Array.isArray(e) ? e : "string" == typeof e ? u(e) : [e.r, e.g, e.b];
    }

    function c(e, t, r) {
      var o = !0 === t ? i : Object.assign({}, i, t);
      return function (e) {
        var t,
            r,
            n = [];

        for (t = 0; t < e.length; t++) r = e[t] / 255, n[t] = r <= .03928 ? r / 12.92 : Math.pow((r + .055) / 1.055, 2.4);

        return .2126 * n[0] + .7152 * n[1] + .0722 * n[2];
      }(e) > n ? r ? u(o.black) : o.black : r ? u(o.white) : o.white;
    }

    function a(e, t) {
      return void 0 === t && (t = !1), e = f(e), t ? c(e, t) : "#" + e.map(function (e) {
        return t = (255 - e).toString(16), void 0 === r && (r = 2), (new Array(r).join("0") + t).slice(-r);
        var t, r;
      }).join("");
    }

    t.invert = a, function (e) {
      function t(e, t) {
        void 0 === t && (t = !1), e = f(e);
        var r,
            n = t ? c(e, t, !0) : e.map(function (e) {
          return 255 - e;
        });
        return {
          r: (r = n)[0],
          g: r[1],
          b: r[2]
        };
      }

      e.asRGB = t, e.asRgbArray = function (e, t) {
        return void 0 === t && (t = !1), e = f(e), t ? c(e, t, !0) : e.map(function (e) {
          return 255 - e;
        });
      }, e.asRgbObject = t;
    }(a || (a = {})), t.invert = a, t.default = a;
  }]).default;
});
// Pressure v2.1.2 | Created By Stuart Yamartino | MIT License | 2015 - 2017
!function (e, t) {
  "function" == typeof define && define.amd ? define(["jquery"], t) : "object" == typeof exports ? module.exports = t(require("jquery")) : e.jQuery__pressure = t(e.jQuery);
}(this, function (e) {
  "use strict";

  function t(e, t) {
    if (!e) throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
    return !t || "object" != typeof t && "function" != typeof t ? e : t;
  }

  function s(e, t) {
    if ("function" != typeof t && null !== t) throw new TypeError("Super expression must either be null or a function, not " + typeof t);
    e.prototype = Object.create(t && t.prototype, {
      constructor: {
        value: e,
        enumerable: !1,
        writable: !0,
        configurable: !0
      }
    }), t && (Object.setPrototypeOf ? Object.setPrototypeOf(e, t) : e.__proto__ = t);
  }

  function n(e, t) {
    if (!(e instanceof t)) throw new TypeError("Cannot call a class as a function");
  }

  var i = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (e) {
    return typeof e;
  } : function (e) {
    return e && "function" == typeof Symbol && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
  },
      r = function () {
    function e(e, t) {
      for (var s = 0; s < t.length; s++) {
        var n = t[s];
        n.enumerable = n.enumerable || !1, n.configurable = !0, "value" in n && (n.writable = !0), Object.defineProperty(e, n.key, n);
      }
    }

    return function (t, s, n) {
      return s && e(t.prototype, s), n && e(t, n), t;
    };
  }();

  if (!e) throw new Error("Pressure jQuery requires jQuery to be loaded.");
  e.fn.pressure = function (e, t) {
    return p(this, e, t), this;
  }, e.pressureConfig = function (e) {
    d.set(e);
  }, e.pressureMap = function (e, t, s, n, i) {
    return f.apply(null, arguments);
  };

  var o = function () {
    function e(t, s, i) {
      n(this, e), this.routeEvents(t, s, i), this.preventSelect(t, i);
    }

    return r(e, [{
      key: "routeEvents",
      value: function (e, t, s) {
        var n = d.get("only", s);
        this.adapter = !v || "pointer" !== n && null !== n ? !P || "touch" !== n && null !== n ? !y || "mouse" !== n && null !== n ? new u(e, t).bindUnsupportedEvent() : new h(e, t, s).bindEvents() : new l(e, t, s).bindEvents() : new c(e, t, s).bindEvents();
      }
    }, {
      key: "preventSelect",
      value: function (e, t) {
        d.get("preventSelect", t) && (e.style.webkitTouchCallout = "none", e.style.webkitUserSelect = "none", e.style.khtmlUserSelect = "none", e.style.MozUserSelect = "none", e.style.msUserSelect = "none", e.style.userSelect = "none");
      }
    }]), e;
  }(),
      u = function () {
    function e(t, s, i) {
      n(this, e), this.el = t, this.block = s, this.options = i, this.pressed = !1, this.deepPressed = !1, this.nativeSupport = !1, this.runningPolyfill = !1, this.runKey = Math.random();
    }

    return r(e, [{
      key: "setPressed",
      value: function (e) {
        this.pressed = e;
      }
    }, {
      key: "setDeepPressed",
      value: function (e) {
        this.deepPressed = e;
      }
    }, {
      key: "isPressed",
      value: function () {
        return this.pressed;
      }
    }, {
      key: "isDeepPressed",
      value: function () {
        return this.deepPressed;
      }
    }, {
      key: "add",
      value: function (e, t) {
        this.el.addEventListener(e, t, !1);
      }
    }, {
      key: "runClosure",
      value: function (e) {
        e in this.block && this.block[e].apply(this.el, Array.prototype.slice.call(arguments, 1));
      }
    }, {
      key: "fail",
      value: function (e, t) {
        d.get("polyfill", this.options) ? this.runKey === t && this.runPolyfill(e) : this.runClosure("unsupported", e);
      }
    }, {
      key: "bindUnsupportedEvent",
      value: function () {
        var e = this;
        this.add(P ? "touchstart" : "mousedown", function (t) {
          return e.runClosure("unsupported", t);
        });
      }
    }, {
      key: "_startPress",
      value: function (e) {
        this.isPressed() === !1 && (this.runningPolyfill = !1, this.setPressed(!0), this.runClosure("start", e));
      }
    }, {
      key: "_startDeepPress",
      value: function (e) {
        this.isPressed() && this.isDeepPressed() === !1 && (this.setDeepPressed(!0), this.runClosure("startDeepPress", e));
      }
    }, {
      key: "_changePress",
      value: function (e, t) {
        this.nativeSupport = !0, this.runClosure("change", e, t);
      }
    }, {
      key: "_endDeepPress",
      value: function () {
        this.isPressed() && this.isDeepPressed() && (this.setDeepPressed(!1), this.runClosure("endDeepPress"));
      }
    }, {
      key: "_endPress",
      value: function () {
        this.runningPolyfill === !1 ? (this.isPressed() && (this._endDeepPress(), this.setPressed(!1), this.runClosure("end")), this.runKey = Math.random(), this.nativeSupport = !1) : this.setPressed(!1);
      }
    }, {
      key: "deepPress",
      value: function (e, t) {
        e >= .5 ? this._startDeepPress(t) : this._endDeepPress();
      }
    }, {
      key: "runPolyfill",
      value: function (e) {
        this.increment = 0 === d.get("polyfillSpeedUp", this.options) ? 1 : 10 / d.get("polyfillSpeedUp", this.options), this.decrement = 0 === d.get("polyfillSpeedDown", this.options) ? 1 : 10 / d.get("polyfillSpeedDown", this.options), this.setPressed(!0), this.runClosure("start", e), this.runningPolyfill === !1 && this.loopPolyfillForce(0, e);
      }
    }, {
      key: "loopPolyfillForce",
      value: function (e, t) {
        this.nativeSupport === !1 && (this.isPressed() ? (this.runningPolyfill = !0, e = e + this.increment > 1 ? 1 : e + this.increment, this.runClosure("change", e, t), this.deepPress(e, t), setTimeout(this.loopPolyfillForce.bind(this, e, t), 10)) : (e = e - this.decrement < 0 ? 0 : e - this.decrement, e < .5 && this.isDeepPressed() && (this.setDeepPressed(!1), this.runClosure("endDeepPress")), 0 === e ? (this.runningPolyfill = !1, this.setPressed(!0), this._endPress()) : (this.runClosure("change", e, t), this.deepPress(e, t), setTimeout(this.loopPolyfillForce.bind(this, e, t), 10))));
      }
    }]), e;
  }(),
      h = function (e) {
    function i(e, s, r) {
      return n(this, i), t(this, (i.__proto__ || Object.getPrototypeOf(i)).call(this, e, s, r));
    }

    return s(i, e), r(i, [{
      key: "bindEvents",
      value: function () {
        this.add("webkitmouseforcewillbegin", this._startPress.bind(this)), this.add("mousedown", this.support.bind(this)), this.add("webkitmouseforcechanged", this.change.bind(this)), this.add("webkitmouseforcedown", this._startDeepPress.bind(this)), this.add("webkitmouseforceup", this._endDeepPress.bind(this)), this.add("mouseleave", this._endPress.bind(this)), this.add("mouseup", this._endPress.bind(this));
      }
    }, {
      key: "support",
      value: function (e) {
        this.isPressed() === !1 && this.fail(e, this.runKey);
      }
    }, {
      key: "change",
      value: function (e) {
        this.isPressed() && e.webkitForce > 0 && this._changePress(this.normalizeForce(e.webkitForce), e);
      }
    }, {
      key: "normalizeForce",
      value: function (e) {
        return this.reachOne(f(e, 1, 3, 0, 1));
      }
    }, {
      key: "reachOne",
      value: function (e) {
        return e > .995 ? 1 : e;
      }
    }]), i;
  }(u),
      l = function (e) {
    function i(e, s, r) {
      return n(this, i), t(this, (i.__proto__ || Object.getPrototypeOf(i)).call(this, e, s, r));
    }

    return s(i, e), r(i, [{
      key: "bindEvents",
      value: function () {
        g ? (this.add("touchforcechange", this.start.bind(this)), this.add("touchstart", this.support.bind(this, 0)), this.add("touchend", this._endPress.bind(this))) : (this.add("touchstart", this.startLegacy.bind(this)), this.add("touchend", this._endPress.bind(this)));
      }
    }, {
      key: "start",
      value: function (e) {
        e.touches.length > 0 && (this._startPress(e), this.touch = this.selectTouch(e), this.touch && this._changePress(this.touch.force, e));
      }
    }, {
      key: "support",
      value: function (e, t) {
        var s = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : this.runKey;
        this.isPressed() === !1 && (e <= 6 ? (e++, setTimeout(this.support.bind(this, e, t, s), 10)) : this.fail(t, s));
      }
    }, {
      key: "startLegacy",
      value: function (e) {
        this.initialForce = e.touches[0].force, this.supportLegacy(0, e, this.runKey, this.initialForce);
      }
    }, {
      key: "supportLegacy",
      value: function (e, t, s, n) {
        n !== this.initialForce ? (this._startPress(t), this.loopForce(t)) : e <= 6 ? (e++, setTimeout(this.supportLegacy.bind(this, e, t, s, n), 10)) : this.fail(t, s);
      }
    }, {
      key: "loopForce",
      value: function (e) {
        this.isPressed() && (this.touch = this.selectTouch(e), setTimeout(this.loopForce.bind(this, e), 10), this._changePress(this.touch.force, e));
      }
    }, {
      key: "selectTouch",
      value: function (e) {
        if (1 === e.touches.length) return this.returnTouch(e.touches[0], e);

        for (var t = 0; t < e.touches.length; t++) if (e.touches[t].target === this.el || this.el.contains(e.touches[t].target)) return this.returnTouch(e.touches[t], e);
      }
    }, {
      key: "returnTouch",
      value: function (e, t) {
        return this.deepPress(e.force, t), e;
      }
    }]), i;
  }(u),
      c = function (e) {
    function i(e, s, r) {
      return n(this, i), t(this, (i.__proto__ || Object.getPrototypeOf(i)).call(this, e, s, r));
    }

    return s(i, e), r(i, [{
      key: "bindEvents",
      value: function () {
        this.add("pointerdown", this.support.bind(this)), this.add("pointermove", this.change.bind(this)), this.add("pointerup", this._endPress.bind(this)), this.add("pointerleave", this._endPress.bind(this));
      }
    }, {
      key: "support",
      value: function (e) {
        this.isPressed() === !1 && (0 === e.pressure || .5 === e.pressure || e.pressure > 1 ? this.fail(e, this.runKey) : (this._startPress(e), this._changePress(e.pressure, e)));
      }
    }, {
      key: "change",
      value: function (e) {
        this.isPressed() && e.pressure > 0 && .5 !== e.pressure && (this._changePress(e.pressure, e), this.deepPress(e.pressure, e));
      }
    }]), i;
  }(u),
      d = {
    polyfill: !0,
    polyfillSpeedUp: 1e3,
    polyfillSpeedDown: 0,
    preventSelect: !0,
    only: null,
    get: function (e, t) {
      return t.hasOwnProperty(e) ? t[e] : this[e];
    },
    set: function (e) {
      for (var t in e) e.hasOwnProperty(t) && this.hasOwnProperty(t) && "get" != t && "set" != t && (this[t] = e[t]);
    }
  },
      p = function (e, t) {
    var s = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : {};
    if ("string" == typeof e || e instanceof String) for (var n = document.querySelectorAll(e), i = 0; i < n.length; i++) new o(n[i], t, s);else if (a(e)) new o(e, t, s);else for (var i = 0; i < e.length; i++) new o(e[i], t, s);
  },
      a = function (e) {
    return "object" === ("undefined" == typeof HTMLElement ? "undefined" : i(HTMLElement)) ? e instanceof HTMLElement : e && "object" === (void 0 === e ? "undefined" : i(e)) && null !== e && 1 === e.nodeType && "string" == typeof e.nodeName;
  },
      f = function (e, t, s, n, i) {
    return (e - t) * (i - n) / (s - t) + n;
  },
      y = !1,
      P = !1,
      v = !1,
      b = !1,
      g = !1;

  if ("undefined" != typeof window) {
    if ("undefined" != typeof Touch) try {
      (Touch.prototype.hasOwnProperty("force") || "force" in new Touch()) && (b = !0);
    } catch (e) {}
    P = "ontouchstart" in window.document && b, y = "onmousemove" in window.document && !P, v = "onpointermove" in window.document, g = "ontouchforcechange" in window.document;
  }
});
/*
 * TypeScript port of Potrace (http://potrace.sourceforge.net).
 * https://github.com/oov/potrace
 *
 * LICENSE: GPL v2
 *
 * Copyright (C) 2001-2013 Peter Selinger.
 * Copyright (C) 2014-2016 kilobtye.
 * Copyright (C) 2016 Oov.
 */
var __extends = this && this.__extends || function (d, b) {
  for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];

  function __() {
    this.constructor = d;
  }

  d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};

var potrace;

(function (potrace) {
  (function (TurnPolicy) {
    TurnPolicy[TurnPolicy["Right"] = 0] = "Right";
    TurnPolicy[TurnPolicy["Black"] = 1] = "Black";
    TurnPolicy[TurnPolicy["White"] = 2] = "White";
    TurnPolicy[TurnPolicy["Majority"] = 3] = "Majority";
    TurnPolicy[TurnPolicy["Minority"] = 4] = "Minority";
  })(potrace.TurnPolicy || (potrace.TurnPolicy = {}));

  var TurnPolicy = potrace.TurnPolicy;
  var CurveTag;

  (function (CurveTag) {
    CurveTag[CurveTag["Curve"] = 0] = "Curve";
    CurveTag[CurveTag["Corner"] = 1] = "Corner";
  })(CurveTag || (CurveTag = {}));

  var Point = function () {
    function Point(x, y) {
      this.x = x;
      this.y = y;
    }

    Point.prototype.copy = function () {
      return new Point(this.x, this.y);
    };

    return Point;
  }();

  var Bitmap = function () {
    function Bitmap(width, height) {
      this.width = width;
      this.height = height;
      this.data = new Int8Array(width * height);
    }

    Bitmap.prototype.at = function (x, y) {
      return x >= 0 && x < this.width && y >= 0 && y < this.height && this.data[this.width * y + x] === 1;
    };

    Bitmap.prototype.flip = function (x, y) {
      var i = this.width * y + x;
      this.data[i] = this.data[i] ? 0 : 1;
    };

    Bitmap.prototype.copy = function () {
      var bm = new Bitmap(this.width, this.height);

      for (var i = 0, len = this.data.length; i < len; ++i) {
        bm.data[i] = this.data[i];
      }

      return bm;
    };

    Bitmap.createFromImage = function (src) {
      var ctx = document.createElement('canvas').getContext('2d');
      ctx.canvas.width = src.width;
      ctx.canvas.height = src.height;
      ctx.drawImage(src, 0, 0);
      var bm = new Bitmap(src.width, src.height);
      var data = ctx.getImageData(0, 0, bm.width, bm.height).data;
      var l = data.length;

      for (i = 0, j = 0; i < l; i += 4, j++) {
        var alphaThreshold = 155;

        if (data[i + 3] > alphaThreshold) {
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
          data[i + 3] = 0;
        } else {
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
          data[i + 3] = 255;
        }
      }

      for (var i = 0, j = 0, l = data.length; i < l; i += 4, ++j) {
        bm.data[j] = 0.2126 * data[i] + 0.7153 * data[i + 1] + 0.0721 * data[i + 2] < 128 ? 1 : 0;
      }

      return bm;
    };

    Bitmap.createFromImageAlpha = function (src) {
      var ctx = document.createElement('canvas').getContext('2d');
      ctx.canvas.width = src.width;
      ctx.canvas.height = src.height;
      ctx.drawImage(src, 0, 0);
      var bm = new Bitmap(src.width, src.height);
      var data = ctx.getImageData(0, 0, bm.width, bm.height).data;

      for (var i = 0, j = 0, l = data.length; i < l; i += 4, ++j) {
        bm.data[j] = data[i + 3] >= 128 ? 1 : 0;
      }

      return bm;
    };

    Bitmap.createFromFunction = function (f, width, height) {
      var bm = new Bitmap(width, height);

      for (var i = 0, y = 0; y < height; ++y) {
        for (var x = 0; x < width; ++i, ++x) {
          bm.data[i] = f(x, y) ? 1 : 0;
        }
      }

      return bm;
    };

    return Bitmap;
  }();

  var Path = function () {
    function Path() {
      this.area = 0;
      this.len = 0;
      this.pt = [];
      this.minX = 100000;
      this.minY = 100000;
      this.maxX = -1;
      this.maxY = -1;
      this.signIsPlus = true;
    }

    Path.prototype.makeCurve = function () {
      this.curve = Curve.createFromPath(this);
    };

    Path.prototype.optimize = function (alphaMax, optCurve, optTolerance) {
      this.curve = this.curve.optimize(alphaMax, optCurve, optTolerance);
    };

    return Path;
  }();

  var Curve = function () {
    function Curve(n) {
      this.n = n;
      this.tag = new Array(n);
      this.c = new Array(n * 3);
      this.vertex = new Array(n);
    }

    Curve.prototype.reverse = function () {
      var m = this.n,
          v = this.vertex;

      for (var i = 0, j = m - 1; i < j; ++i, --j) {
        var tmp = v[i];
        v[i] = v[j];
        v[j] = tmp;
      }
    };

    Curve.createFromPath = function (path) {
      return CurveBuilder.build(path);
    };

    Curve.prototype.optimize = function (alphaMax, optCurve, optTolerance) {
      return CurveOptimizer.optimize(this, alphaMax, optCurve, optTolerance);
    };

    return Curve;
  }();

  var CurveBuilder = function () {
    function CurveBuilder(path) {
      this.path = path;
    }

    CurveBuilder.build = function (path) {
      var cb = new CurveBuilder(path);
      cb.calcSums();
      cb.calcLon();
      cb.bestPolygon();
      return cb.adjustVertices();
    };

    CurveBuilder.prototype.calcSums = function () {
      var path = this.path;
      this.x0 = path.pt[0].x;
      this.y0 = path.pt[0].y;
      this.sums = [];
      var s = this.sums;
      s.push(new Sum(0, 0, 0, 0, 0));

      for (var i = 0; i < path.len; ++i) {
        var x = path.pt[i].x - this.x0;
        var y = path.pt[i].y - this.y0;
        s.push(new Sum(s[i].x + x, s[i].y + y, s[i].xy + x * y, s[i].x2 + x * x, s[i].y2 + y * y));
      }
    };

    CurveBuilder.prototype.calcLon = function () {
      var path = this.path;
      var n = path.len,
          pt = path.pt;
      var dir,
          pivk = new Array(n),
          nc = new Array(n),
          ct = new Array(4);
      this.lon = new Array(n);
      var constraint = [new Point(0, 0), new Point(0, 0)],
          cur = new Point(0, 0),
          off = new Point(0, 0),
          dk = new Point(0, 0);

      for (var i = n - 1, k = 0; i >= 0; --i) {
        if (pt[i].x !== pt[k].x && pt[i].y !== pt[k].y) {
          k = i + 1;
        }

        nc[i] = k;
      }

      for (var i = n - 1; i >= 0; --i) {
        ct[0] = ct[1] = ct[2] = ct[3] = 0;
        dir = (3 + 3 * (pt[mod(i + 1, n)].x - pt[i].x) + (pt[mod(i + 1, n)].y - pt[i].y)) / 2;
        ++ct[dir];
        constraint[0].x = 0;
        constraint[0].y = 0;
        constraint[1].x = 0;
        constraint[1].y = 0;
        var k = nc[i];
        var k1 = i;
        var foundk = void 0;

        while (1) {
          foundk = false;
          dir = (3 + 3 * sign(pt[k].x - pt[k1].x) + sign(pt[k].y - pt[k1].y)) / 2;
          ++ct[dir];

          if (ct[0] && ct[1] && ct[2] && ct[3]) {
            pivk[i] = k1;
            foundk = true;
            break;
          }

          cur.x = pt[k].x - pt[i].x;
          cur.y = pt[k].y - pt[i].y;

          if (xprod(constraint[0], cur) < 0 || xprod(constraint[1], cur) > 0) {
            break;
          }

          if (Math.abs(cur.x) > 1 || Math.abs(cur.y) > 1) {
            off.x = cur.x + (cur.y >= 0 && (cur.y > 0 || cur.x < 0) ? 1 : -1);
            off.y = cur.y + (cur.x <= 0 && (cur.x < 0 || cur.y < 0) ? 1 : -1);

            if (xprod(constraint[0], off) >= 0) {
              constraint[0].x = off.x;
              constraint[0].y = off.y;
            }

            off.x = cur.x + (cur.y <= 0 && (cur.y < 0 || cur.x < 0) ? 1 : -1);
            off.y = cur.y + (cur.x >= 0 && (cur.x > 0 || cur.y < 0) ? 1 : -1);

            if (xprod(constraint[1], off) <= 0) {
              constraint[1].x = off.x;
              constraint[1].y = off.y;
            }
          }

          k1 = k;
          k = nc[k1];

          if (!cyclic(k, i, k1)) {
            break;
          }
        }

        if (!foundk) {
          dk.x = sign(pt[k].x - pt[k1].x);
          dk.y = sign(pt[k].y - pt[k1].y);
          cur.x = pt[k1].x - pt[i].x;
          cur.y = pt[k1].y - pt[i].y;
          var a = xprod(constraint[0], cur);
          var b = xprod(constraint[0], dk);
          var c = xprod(constraint[1], cur);
          var d = xprod(constraint[1], dk);
          var j_1 = 10000000;

          if (b < 0) {
            j_1 = Math.floor(a / -b);
          }

          if (d > 0) {
            j_1 = Math.min(j_1, Math.floor(-c / d));
          }

          pivk[i] = mod(k1 + j_1, n);
        }
      }

      var j = pivk[n - 1];
      this.lon[n - 1] = j;

      for (var i = n - 2; i >= 0; --i) {
        if (cyclic(i + 1, pivk[i], j)) {
          j = pivk[i];
        }

        this.lon[i] = j;
      }

      for (var i = n - 1; cyclic(mod(i + 1, n), j, this.lon[i]); --i) {
        this.lon[i] = j;
      }
    };

    CurveBuilder.prototype.bestPolygon = function () {
      var n = this.path.len;
      var pen = new Array(n + 1);
      var prev = new Array(n + 1);
      var clip0 = new Array(n);
      var clip1 = new Array(n + 1);
      var seg0 = new Array(n + 1);
      var seg1 = new Array(n + 1);

      for (var i_1 = 0; i_1 < n; ++i_1) {
        var c = mod(this.lon[mod(i_1 - 1, n)] - 1, n);

        if (c === i_1) {
          c = mod(i_1 + 1, n);
        }

        if (c < i_1) {
          clip0[i_1] = n;
        } else {
          clip0[i_1] = c;
        }
      }

      for (var i_2 = 0, j_2 = 1; i_2 < n; ++i_2) {
        while (j_2 <= clip0[i_2]) {
          clip1[j_2] = i_2;
          ++j_2;
        }
      }

      var j = 0;

      for (var i_3 = 0; i_3 < n; ++j) {
        seg0[j] = i_3;
        i_3 = clip0[i_3];
      }

      seg0[j] = n;
      var m = j;
      var i = n;

      for (var j_3 = m; j_3 > 0; --j_3) {
        seg1[j_3] = i;
        i = clip1[i];
      }

      seg1[0] = 0;
      pen[0] = 0;

      for (var j_4 = 1; j_4 <= m; ++j_4) {
        for (var i_4 = seg1[j_4]; i_4 <= seg0[j_4]; ++i_4) {
          var best = -1;

          for (var k = seg0[j_4 - 1]; k >= clip1[i_4]; --k) {
            var thispen = this.penalty3(k, i_4) + pen[k];

            if (best < 0 || thispen < best) {
              prev[i_4] = k;
              best = thispen;
            }
          }

          pen[i_4] = best;
        }
      }

      this.m = m;
      this.po = new Array(m);

      for (var i_5 = n, j_5 = m - 1; i_5 > 0; --j_5) {
        i_5 = prev[i_5];
        this.po[j_5] = i_5;
      }
    };

    CurveBuilder.prototype.penalty3 = function (i, j) {
      var n = this.path.len,
          pt = this.path.pt,
          sums = this.sums;
      var r = 0;

      if (j >= n) {
        j -= n;
        r = 1;
      }

      var x, y, x2, xy, y2, k;

      if (r === 0) {
        x = sums[j + 1].x - sums[i].x;
        y = sums[j + 1].y - sums[i].y;
        x2 = sums[j + 1].x2 - sums[i].x2;
        xy = sums[j + 1].xy - sums[i].xy;
        y2 = sums[j + 1].y2 - sums[i].y2;
        k = j + 1 - i;
      } else {
        x = sums[j + 1].x - sums[i].x + sums[n].x;
        y = sums[j + 1].y - sums[i].y + sums[n].y;
        x2 = sums[j + 1].x2 - sums[i].x2 + sums[n].x2;
        xy = sums[j + 1].xy - sums[i].xy + sums[n].xy;
        y2 = sums[j + 1].y2 - sums[i].y2 + sums[n].y2;
        k = j + 1 - i + n;
      }

      var px = (pt[i].x + pt[j].x) / 2.0 - pt[0].x;
      var py = (pt[i].y + pt[j].y) / 2.0 - pt[0].y;
      var ey = pt[j].x - pt[i].x;
      var ex = -(pt[j].y - pt[i].y);
      var a = (x2 - 2 * x * px) / k + px * px;
      var b = (xy - x * py - y * px) / k + px * py;
      var c = (y2 - 2 * y * py) / k + py * py;
      var s = ex * ex * a + 2 * ex * ey * b + ey * ey * c;
      return Math.sqrt(s);
    };

    CurveBuilder.prototype.adjustVertices = function () {
      var path = this.path;
      var m = this.m,
          po = this.po,
          n = path.len,
          pt = path.pt,
          x0 = this.x0,
          y0 = this.y0;
      var ctr = new Array(m),
          dir = new Array(m),
          q = new Array(m);
      var v = new Array(3);
      var s = new Point(0, 0);
      var curve = new Curve(m);

      for (var i = 0; i < m; ++i) {
        var j = po[mod(i + 1, m)];
        j = mod(j - po[i], n) + po[i];
        ctr[i] = new Point(0, 0);
        dir[i] = new Point(0, 0);
        this.pointslope(po[i], j, ctr[i], dir[i]);
      }

      for (var i = 0; i < m; ++i) {
        q[i] = new Quad();
        var d = dir[i].x * dir[i].x + dir[i].y * dir[i].y;

        if (d === 0.0) {
          for (var j = 0; j < 3; ++j) {
            for (var k = 0; k < 3; ++k) {
              q[i].data[j * 3 + k] = 0;
            }
          }
        } else {
          v[0] = dir[i].y;
          v[1] = -dir[i].x;
          v[2] = -v[1] * ctr[i].y - v[0] * ctr[i].x;

          for (var l = 0; l < 3; ++l) {
            for (var k = 0; k < 3; ++k) {
              q[i].data[l * 3 + k] = v[l] * v[k] / d;
            }
          }
        }
      }

      for (var i = 0; i < m; ++i) {
        var Q = new Quad();
        var w = new Point(0, 0);
        s.x = pt[po[i]].x - x0;
        s.y = pt[po[i]].y - y0;
        var j = mod(i - 1, m);

        for (var l = 0; l < 3; ++l) {
          for (var k = 0; k < 3; ++k) {
            Q.data[l * 3 + k] = q[j].at(l, k) + q[i].at(l, k);
          }
        }

        while (true) {
          var det = Q.at(0, 0) * Q.at(1, 1) - Q.at(0, 1) * Q.at(1, 0);

          if (det !== 0.0) {
            w.x = (-Q.at(0, 2) * Q.at(1, 1) + Q.at(1, 2) * Q.at(0, 1)) / det;
            w.y = (Q.at(0, 2) * Q.at(1, 0) - Q.at(1, 2) * Q.at(0, 0)) / det;
            break;
          }

          if (Q.at(0, 0) > Q.at(1, 1)) {
            v[0] = -Q.at(0, 1);
            v[1] = Q.at(0, 0);
          } else if (Q.at(1, 1)) {
            v[0] = -Q.at(1, 1);
            v[1] = Q.at(1, 0);
          } else {
            v[0] = 1;
            v[1] = 0;
          }

          var d = v[0] * v[0] + v[1] * v[1];
          v[2] = -v[1] * s.y - v[0] * s.x;

          for (var l = 0; l < 3; ++l) {
            for (var k = 0; k < 3; ++k) {
              Q.data[l * 3 + k] += v[l] * v[k] / d;
            }
          }
        }

        var dx = Math.abs(w.x - s.x);
        var dy = Math.abs(w.y - s.y);

        if (dx <= 0.5 && dy <= 0.5) {
          curve.vertex[i] = new Point(w.x + x0, w.y + y0);
          continue;
        }

        var min = Q.apply(s);
        var xmin = s.x;
        var ymin = s.y;

        if (Q.at(0, 0) !== 0.0) {
          for (var z = 0; z < 2; ++z) {
            w.y = s.y - 0.5 + z;
            w.x = -(Q.at(0, 1) * w.y + Q.at(0, 2)) / Q.at(0, 0);
            dx = Math.abs(w.x - s.x);
            var cand = Q.apply(w);

            if (dx <= 0.5 && cand < min) {
              min = cand;
              xmin = w.x;
              ymin = w.y;
            }
          }
        }

        if (Q.at(1, 1) !== 0.0) {
          for (var z = 0; z < 2; ++z) {
            w.x = s.x - 0.5 + z;
            w.y = -(Q.at(1, 0) * w.x + Q.at(1, 2)) / Q.at(1, 1);
            dy = Math.abs(w.y - s.y);
            var cand = Q.apply(w);

            if (dy <= 0.5 && cand < min) {
              min = cand;
              xmin = w.x;
              ymin = w.y;
            }
          }
        }

        for (var l = 0; l < 2; ++l) {
          for (var k = 0; k < 2; ++k) {
            w.x = s.x - 0.5 + l;
            w.y = s.y - 0.5 + k;
            var cand = Q.apply(w);

            if (cand < min) {
              min = cand;
              xmin = w.x;
              ymin = w.y;
            }
          }
        }

        curve.vertex[i] = new Point(xmin + x0, ymin + y0);
      }

      if (!path.signIsPlus) {
        curve.reverse();
      }

      return curve;
    };

    CurveBuilder.prototype.pointslope = function (i, j, ctr, dir) {
      var n = this.path.len,
          sums = this.sums;
      var r = 0;

      while (j >= n) {
        j -= n;
        r += 1;
      }

      while (i >= n) {
        i -= n;
        r -= 1;
      }

      while (j < 0) {
        j += n;
        r -= 1;
      }

      while (i < 0) {
        i += n;
        r += 1;
      }

      var x = sums[j + 1].x - sums[i].x + r * sums[n].x;
      var y = sums[j + 1].y - sums[i].y + r * sums[n].y;
      var x2 = sums[j + 1].x2 - sums[i].x2 + r * sums[n].x2;
      var xy = sums[j + 1].xy - sums[i].xy + r * sums[n].xy;
      var y2 = sums[j + 1].y2 - sums[i].y2 + r * sums[n].y2;
      var k = j + 1 - i + r * n;
      ctr.x = x / k;
      ctr.y = y / k;
      var a = (x2 - x * x / k) / k;
      var b = (xy - x * y / k) / k;
      var c = (y2 - y * y / k) / k;
      var lambda2 = (a + c + Math.sqrt((a - c) * (a - c) + 4 * b * b)) / 2;
      a -= lambda2;
      c -= lambda2;
      var l;

      if (Math.abs(a) >= Math.abs(c)) {
        l = Math.sqrt(a * a + b * b);

        if (l !== 0) {
          dir.x = -b / l;
          dir.y = a / l;
        }
      } else {
        l = Math.sqrt(c * c + b * b);

        if (l !== 0) {
          dir.x = -c / l;
          dir.y = b / l;
        }
      }

      if (l === 0) {
        dir.x = dir.y = 0;
      }
    };

    return CurveBuilder;
  }();

  var CurveOptimizer = function () {
    function CurveOptimizer(curve) {
      this.curve = curve;
      this.alphaCurve = 0;
      var n = curve.n;
      this.alpha = new Array(n);
      this.alpha0 = new Array(n);
      this.beta = new Array(n);
    }

    CurveOptimizer.optimize = function (curve, alphaMax, optCurve, optTolerance) {
      var opt = new CurveOptimizer(curve);
      opt.smooth(alphaMax);

      if (optCurve) {
        return opt.optiCurve(optTolerance);
      }

      return curve;
    };

    CurveOptimizer.prototype.smooth = function (alphaMax) {
      var curve = this.curve;
      var vertex = curve.vertex;
      var m = curve.n;

      for (var i = 0; i < m; ++i) {
        var j = mod(i + 1, m);
        var k = mod(i + 2, m);
        var p4 = interval(1 / 2.0, vertex[k], vertex[j]);
        var denom = ddenom(vertex[i], vertex[k]);
        var alpha = void 0;

        if (denom !== 0.0) {
          var dd = Math.abs(dpara(vertex[i], vertex[j], vertex[k]) / denom);
          alpha = (dd > 1 ? 1 - 1.0 / dd : 0) / 0.75;
        } else {
          alpha = 4 / 3.0;
        }

        this.alpha0[j] = alpha;

        if (alpha >= alphaMax) {
          curve.tag[j] = 1
          /* Corner */
          ;
          curve.c[3 * j + 1] = vertex[j];
          curve.c[3 * j + 2] = p4;
        } else {
          if (alpha < 0.55) {
            alpha = 0.55;
          } else if (alpha > 1) {
            alpha = 1;
          }

          curve.tag[j] = 0
          /* Curve */
          ;
          curve.c[3 * j + 0] = interval(0.5 + 0.5 * alpha, vertex[i], vertex[j]);
          curve.c[3 * j + 1] = interval(0.5 + 0.5 * alpha, vertex[k], vertex[j]);
          curve.c[3 * j + 2] = p4;
        }

        this.alpha[j] = alpha;
        this.beta[j] = 0.5;
      }

      this.alphaCurve = 1;
    };

    CurveOptimizer.prototype.optiCurve = function (optTolerance) {
      var curve = this.curve;
      var m = curve.n,
          vert = curve.vertex,
          pt = new Array(m + 1),
          pen = new Array(m + 1),
          len = new Array(m + 1),
          opt = new Array(m + 1);
      var convc = new Array(m),
          areac = new Array(m + 1);

      for (var i = 0; i < m; ++i) {
        if (curve.tag[i] === 0
        /* Curve */
        ) {
            convc[i] = sign(dpara(vert[mod(i - 1, m)], vert[i], vert[mod(i + 1, m)]));
          } else {
          convc[i] = 0;
        }
      }

      var area = 0.0;
      areac[0] = 0.0;
      var p0 = curve.vertex[0];

      for (var i = 0; i < m; ++i) {
        var i1 = mod(i + 1, m);

        if (curve.tag[i1] === 0
        /* Curve */
        ) {
            var alpha = this.alpha[i1];
            area += 0.3 * alpha * (4 - alpha) * dpara(curve.c[i * 3 + 2], vert[i1], curve.c[i1 * 3 + 2]) / 2;
            area += dpara(p0, curve.c[i * 3 + 2], curve.c[i1 * 3 + 2]) / 2;
          }

        areac[i + 1] = area;
      }

      pt[0] = -1;
      pen[0] = 0;
      len[0] = 0;
      var o = new Opti();

      for (var j = 1; j <= m; ++j) {
        pt[j] = j - 1;
        pen[j] = pen[j - 1];
        len[j] = len[j - 1] + 1;

        for (var i = j - 2; i >= 0; --i) {
          var r = this.optiPenalty(i, mod(j, m), o, optTolerance, convc, areac);

          if (r) {
            break;
          }

          if (len[j] > len[i] + 1 || len[j] === len[i] + 1 && pen[j] > pen[i] + o.pen) {
            pt[j] = i;
            pen[j] = pen[i] + o.pen;
            len[j] = len[i] + 1;
            opt[j] = o;
            o = new Opti();
          }
        }
      }

      var om = len[m];
      var ocurve = new Curve(om);
      var s = new Array(om);
      var t = new Array(om);

      for (var i = om - 1, j = m; i >= 0; --i) {
        if (pt[j] === j - 1) {
          ocurve.tag[i] = curve.tag[mod(j, m)];
          ocurve.c[i * 3 + 0] = curve.c[mod(j, m) * 3 + 0];
          ocurve.c[i * 3 + 1] = curve.c[mod(j, m) * 3 + 1];
          ocurve.c[i * 3 + 2] = curve.c[mod(j, m) * 3 + 2];
          ocurve.vertex[i] = curve.vertex[mod(j, m)]; // ocurve.alpha[i] = this.alpha[mod(j, m)];
          // ocurve.alpha0[i] = this.alpha0[mod(j, m)];
          // ocurve.beta[i] = this.beta[mod(j, m)];

          s[i] = t[i] = 1.0;
        } else {
          ocurve.tag[i] = 0
          /* Curve */
          ;
          ocurve.c[i * 3 + 0] = opt[j].c[0];
          ocurve.c[i * 3 + 1] = opt[j].c[1];
          ocurve.c[i * 3 + 2] = curve.c[mod(j, m) * 3 + 2];
          ocurve.vertex[i] = interval(opt[j].s, curve.c[mod(j, m) * 3 + 2], vert[mod(j, m)]); // ocurve.alpha[i] = opt[j].alpha;
          // ocurve.alpha0[i] = opt[j].alpha;

          s[i] = opt[j].s;
          t[i] = opt[j].t;
        }

        j = pt[j];
      } // for (let i = 0; i < om; ++i) {
      //    ocurve.beta[i] = s[i] / (s[i] + t[mod(i + 1, om)]);
      // }
      // ocurve.alphaCurve = 1;


      return ocurve;
    };

    CurveOptimizer.prototype.optiPenalty = function (i, j, res, optTolerance, convc, areac) {
      var curve = this.curve;
      var m = curve.n,
          vertex = curve.vertex;

      if (i === j) {
        return true;
      }

      var k = i;
      var i1 = mod(i + 1, m);
      var k1 = mod(k + 1, m);
      var conv = convc[k1];

      if (conv === 0) {
        return true;
      }

      var d = ddist(vertex[i], vertex[i1]);

      for (var k_1 = k1; k_1 !== j; k_1 = k1) {
        k1 = mod(k_1 + 1, m);
        var k2 = mod(k_1 + 2, m);

        if (convc[k1] !== conv) {
          return true;
        }

        if (sign(cprod(vertex[i], vertex[i1], vertex[k1], vertex[k2])) !== conv) {
          return true;
        }

        if (iprod1(vertex[i], vertex[i1], vertex[k1], vertex[k2]) < d * ddist(vertex[k1], vertex[k2]) * -0.999847695156) {
          return true;
        }
      }

      var p0 = curve.c[mod(i, m) * 3 + 2].copy();
      var p1 = vertex[mod(i + 1, m)].copy();
      var p2 = vertex[mod(j, m)].copy();
      var p3 = curve.c[mod(j, m) * 3 + 2].copy();
      var area = areac[j] - areac[i];
      area -= dpara(vertex[0], curve.c[i * 3 + 2], curve.c[j * 3 + 2]) / 2;

      if (i >= j) {
        area += areac[m];
      }

      var A1 = dpara(p0, p1, p2);
      var A2 = dpara(p0, p1, p3);
      var A3 = dpara(p0, p2, p3);

      if (A2 === A1) {
        return true;
      }

      var A4 = A1 + A3 - A2;
      var t = A3 / (A3 - A4);
      var s = A2 / (A2 - A1);
      var A = A2 * t / 2.0;

      if (A === 0.0) {
        return true;
      }

      var R = area / A;
      var alpha = 2 - Math.sqrt(4 - R / 0.3);
      res.c[0] = interval(t * alpha, p0, p1);
      res.c[1] = interval(s * alpha, p3, p2);
      res.alpha = alpha;
      res.t = t;
      res.s = s;
      p1 = res.c[0].copy();
      p2 = res.c[1].copy();
      res.pen = 0;

      for (var k_2 = mod(i + 1, m), k1_1; k_2 !== j; k_2 = k1_1) {
        k1_1 = mod(k_2 + 1, m);
        var t_1 = tangent(p0, p1, p2, p3, vertex[k_2], vertex[k1_1]);

        if (t_1 < -0.5) {
          return true;
        }

        var pt = bezier(t_1, p0, p1, p2, p3);
        var d_1 = ddist(vertex[k_2], vertex[k1_1]);

        if (d_1 === 0.0) {
          return true;
        }

        var d1 = dpara(vertex[k_2], vertex[k1_1], pt) / d_1;

        if (Math.abs(d1) > optTolerance) {
          return true;
        }

        if (iprod(vertex[k_2], vertex[k1_1], pt) < 0 || iprod(vertex[k1_1], vertex[k_2], pt) < 0) {
          return true;
        }

        res.pen += d1 * d1;
      }

      for (var k_3 = i, k1_2; k_3 !== j; k_3 = k1_2) {
        k1_2 = mod(k_3 + 1, m);
        var t_2 = tangent(p0, p1, p2, p3, curve.c[k_3 * 3 + 2], curve.c[k1_2 * 3 + 2]);

        if (t_2 < -0.5) {
          return true;
        }

        var pt = bezier(t_2, p0, p1, p2, p3);
        var d_2 = ddist(curve.c[k_3 * 3 + 2], curve.c[k1_2 * 3 + 2]);

        if (d_2 === 0.0) {
          return true;
        }

        var d1 = dpara(curve.c[k_3 * 3 + 2], curve.c[k1_2 * 3 + 2], pt) / d_2;
        var d2 = dpara(curve.c[k_3 * 3 + 2], curve.c[k1_2 * 3 + 2], vertex[k1_2]) / d_2;
        d2 *= 0.75 * this.alpha[k1_2];

        if (d2 < 0) {
          d1 = -d1;
          d2 = -d2;
        }

        if (d1 < d2 - optTolerance) {
          return true;
        }

        if (d1 < d2) {
          res.pen += (d1 - d2) * (d1 - d2);
        }
      }

      return false;
    };

    return CurveOptimizer;
  }();

  var Quad = function () {
    function Quad() {
      this.data = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    }

    Quad.prototype.at = function (x, y) {
      return this.data[x * 3 + y];
    };

    Quad.prototype.apply = function (w) {
      var v = [w.x, w.y, 1];
      var sum = 0.0;

      for (var i = 0; i < 3; ++i) {
        for (var j = 0; j < 3; ++j) {
          sum += v[i] * this.at(i, j) * v[j];
        }
      }

      return sum;
    };

    return Quad;
  }();

  var Sum = function () {
    function Sum(x, y, xy, x2, y2) {
      this.x = x;
      this.y = y;
      this.xy = xy;
      this.x2 = x2;
      this.y2 = y2;
    }

    return Sum;
  }();

  var Opti = function () {
    function Opti() {
      this.pen = 0;
      this.c = [new Point(0, 0), new Point(0, 0)];
      this.t = 0;
      this.s = 0;
      this.alpha = 0;
    }

    return Opti;
  }();

  var PathList = function (_super) {
    __extends(PathList, _super);

    function PathList(width, height) {
      _super.call(this);

      this.width = width;
      this.height = height;
    }

    PathList.prototype.toSVG = function (scale, stroke) {
      var w = this.width * scale,
          h = this.height * scale;
      var svg = ["<svg id=\"svg\" version=\"1.1\" width=\"" + w + "\" height=\"" + h + "\" xmlns=\"http://www.w3.org/2000/svg\">"];
      svg.push('<path d="');

      for (var i = 0, len = this.length; i < len; ++i) {
        var curve = this[i].curve,
            c = curve.c,
            n = curve.n * 3;
        svg.push('M' + (c[n - 1].x * scale).toFixed(3) + ' ' + (c[n - 1].y * scale).toFixed(3) + ' ');

        for (var i_6 = 0, j = 0; j < n; ++i_6, j += 3) {
          if (curve.tag[i_6] === 0
          /* Curve */
          ) {
              svg.push('C ' + (c[j + 0].x * scale).toFixed(3) + ' ' + (c[j + 0].y * scale).toFixed(3) + ',');
              svg.push((c[j + 1].x * scale).toFixed(3) + ' ' + (c[j + 1].y * scale).toFixed(3) + ',');
              svg.push((c[j + 2].x * scale).toFixed(3) + ' ' + (c[j + 2].y * scale).toFixed(3) + ' ');
            } else if (curve.tag[i_6] === 1
          /* Corner */
          ) {
              svg.push('L ' + (c[j + 1].x * scale).toFixed(3) + ' ' + (c[j + 1].y * scale).toFixed(3) + ' ');
              svg.push((c[j + 2].x * scale).toFixed(3) + ' ' + (c[j + 2].y * scale).toFixed(3) + ' ');
            }
        }
      }

      if (stroke) {
        svg.push('" stroke="black" fill="none"/>');
      } else {
        svg.push('" stroke="none" fill="black" fill-rule="evenodd"/>');
      }

      svg.push('</svg>');
      return svg.join('');
    };

    PathList.prototype.simplify = function () {
      var r = [];

      for (var i = 0, len = this.length; i < len; ++i) {
        var curve = this[i].curve,
            c = curve.c,
            n = curve.n * 3;
        r.push([c[n - 1].x, c[n - 1].y]);

        for (var i_7 = 0, j = 0; j < n; ++i_7, j += 3) {
          if (curve.tag[i_7] === 0
          /* Curve */
          ) {
              r.push([c[j + 0].x, c[j + 0].y, c[j + 1].x, c[j + 1].y, c[j + 2].x, c[j + 2].y]);
            } else if (curve.tag[i_7] === 1
          /* Corner */
          ) {
              r.push([c[j + 1].x, c[j + 1].y, c[j + 2].x, c[j + 2].y]);
            }
        }
      }

      return {
        paths: r,
        width: this.width,
        height: this.height
      };
    };

    PathList.prototype.strokePath = function (ctx) {
      for (var i = 0, len = this.length; i < len; ++i) {
        var curve = this[i].curve,
            c = curve.c,
            n = curve.n * 3;
        ctx.moveTo(c[n - 1].x, c[n - 1].y);

        for (var i_8 = 0, j = 0; j < n; ++i_8, j += 3) {
          if (curve.tag[i_8] === 0
          /* Curve */
          ) {
              ctx.bezierCurveTo(c[j + 0].x, c[j + 0].y, c[j + 1].x, c[j + 1].y, c[j + 2].x, c[j + 2].y);
            } else if (curve.tag[i_8] === 1
          /* Corner */
          ) {
              ctx.lineTo(c[j + 1].x, c[j + 1].y);
              ctx.lineTo(c[j + 2].x, c[j + 2].y);
            }
        }
      }
    };

    PathList.optimize = function (pl, alphaMax, optCurve, optTolerance) {
      for (var i = 0; i < pl.length; ++i) {
        pl[i].makeCurve();
        pl[i].optimize(alphaMax, optCurve, optTolerance);
      }
    };

    PathList.fromFunction = function (f, width, height, policy, turdSize, alphaMax, optCurve, optTolerance) {
      var bm = Bitmap.createFromFunction(f, width, height);
      var pl = new PathListBuilder(bm, policy).trace(f, turdSize);
      PathList.optimize(pl, alphaMax, optCurve, optTolerance);
      return pl;
    };

    PathList.fromBitmap = function (src, policy, turdSize, alphaMax, optCurve, optTolerance) {
      var pl = new PathListBuilder(src.copy(), policy).trace(function (x, y) {
        return src.at(x, y);
      }, turdSize);
      PathList.optimize(pl, alphaMax, optCurve, optTolerance);
      return pl;
    };

    return PathList;
  }(Array);

  var PathListBuilder = function () {
    function PathListBuilder(bm, policy) {
      this.bm = bm;
      this.policy = policy;
    }

    PathListBuilder.prototype.trace = function (f, turdSize) {
      var r = new PathList(this.bm.width, this.bm.height);
      var cur = new Point(0, 0);

      while (cur = this.findNext(cur)) {
        var path = this.findPath(cur, f(cur.x, cur.y));
        this.xorPath(path);

        if (path.area > turdSize) {
          r.push(path);
        }
      }

      return r;
    };

    PathListBuilder.prototype.findNext = function (prev) {
      var bm = this.bm;
      var width = bm.width,
          height = bm.height;

      for (var x = prev.x; x < width; ++x) {
        if (bm.at(x, prev.y)) {
          return new Point(x, prev.y);
        }
      }

      for (var y = prev.y + 1; y < height; ++y) {
        for (var x = 0; x < width; ++x) {
          if (bm.at(x, y)) {
            return new Point(x, y);
          }
        }
      }

      return null;
    };

    PathListBuilder.prototype.majority = function (x, y) {
      var bm = this.bm;

      for (var i = 2; i < 5; ++i) {
        var ct = 0;

        for (var a = -i + 1; a <= i - 1; ++a) {
          ct += bm.at(x + a, y + i - 1) ? 1 : -1;
          ct += bm.at(x + i - 1, y + a - 1) ? 1 : -1;
          ct += bm.at(x + a - 1, y - i) ? 1 : -1;
          ct += bm.at(x - i, y + a) ? 1 : -1;
        }

        if (ct > 0) {
          return 1;
        } else if (ct < 0) {
          return 0;
        }
      }

      return 0;
    };

    PathListBuilder.prototype.findPath = function (point, signIsPlus) {
      var bm = this.bm;
      var turnPolicy = this.policy;
      var path = new Path();
      var x = point.x,
          y = point.y,
          dirx = 0,
          diry = 1,
          tmp;
      path.signIsPlus = signIsPlus;

      while (1) {
        path.pt.push(new Point(x, y));

        if (x > path.maxX) {
          path.maxX = x;
        }

        if (x < path.minX) {
          path.minX = x;
        }

        if (y > path.maxY) {
          path.maxY = y;
        }

        if (y < path.minY) {
          path.minY = y;
        }

        ++path.len;
        x += dirx;
        y += diry;
        path.area -= x * diry;

        if (x === point.x && y === point.y) {
          break;
        }

        var l = bm.at(x + (dirx + diry - 1) / 2, y + (diry - dirx - 1) / 2);
        var r = bm.at(x + (dirx - diry - 1) / 2, y + (diry + dirx - 1) / 2);

        if (r && !l) {
          if (turnPolicy === 0
          /* Right */
          || turnPolicy === 1
          /* Black */
          && path.signIsPlus || turnPolicy === 2
          /* White */
          && !path.signIsPlus || turnPolicy === 3
          /* Majority */
          && this.majority(x, y) || turnPolicy === 4
          /* Minority */
          && !this.majority(x, y)) {
            tmp = dirx;
            dirx = -diry;
            diry = tmp;
          } else {
            tmp = dirx;
            dirx = diry;
            diry = -tmp;
          }
        } else if (r) {
          tmp = dirx;
          dirx = -diry;
          diry = tmp;
        } else if (!l) {
          tmp = dirx;
          dirx = diry;
          diry = -tmp;
        }
      }

      return path;
    };

    PathListBuilder.prototype.xorPath = function (path) {
      var bm = this.bm;
      var y1 = path.pt[0].y;
      var len = path.len;

      for (var i = 1; i < len; ++i) {
        var x = path.pt[i].x;
        var y = path.pt[i].y;

        if (y !== y1) {
          var minY = y1 < y ? y1 : y;
          var maxX = path.maxX;

          for (var j = x; j < maxX; ++j) {
            bm.flip(j, minY);
          }

          y1 = y;
        }
      }
    };

    return PathListBuilder;
  }();

  function mod(a, n) {
    return a >= n ? a % n : a >= 0 ? a : n - 1 - (-1 - a) % n;
  }

  function xprod(p1, p2) {
    return p1.x * p2.y - p1.y * p2.x;
  }

  function cyclic(a, b, c) {
    if (a <= c) {
      return a <= b && b < c;
    } else {
      return a <= b || b < c;
    }
  }

  function sign(i) {
    return i > 0 ? 1 : i < 0 ? -1 : 0;
  }

  function interval(lambda, a, b) {
    return new Point(a.x + lambda * (b.x - a.x), a.y + lambda * (b.y - a.y));
  }

  function dorth_infty(p0, p2) {
    return new Point(-sign(p2.y - p0.y), sign(p2.x - p0.x));
  }

  function ddenom(p0, p2) {
    var r = dorth_infty(p0, p2);
    return r.y * (p2.x - p0.x) - r.x * (p2.y - p0.y);
  }

  function dpara(p0, p1, p2) {
    var x1 = p1.x - p0.x;
    var y1 = p1.y - p0.y;
    var x2 = p2.x - p0.x;
    var y2 = p2.y - p0.y;
    return x1 * y2 - x2 * y1;
  }

  function cprod(p0, p1, p2, p3) {
    var x1 = p1.x - p0.x;
    var y1 = p1.y - p0.y;
    var x2 = p3.x - p2.x;
    var y2 = p3.y - p2.y;
    return x1 * y2 - x2 * y1;
  }

  function iprod(p0, p1, p2) {
    var x1 = p1.x - p0.x;
    var y1 = p1.y - p0.y;
    var x2 = p2.x - p0.x;
    var y2 = p2.y - p0.y;
    return x1 * x2 + y1 * y2;
  }

  function iprod1(p0, p1, p2, p3) {
    var x1 = p1.x - p0.x;
    var y1 = p1.y - p0.y;
    var x2 = p3.x - p2.x;
    var y2 = p3.y - p2.y;
    return x1 * x2 + y1 * y2;
  }

  function ddist(p, q) {
    return Math.sqrt((p.x - q.x) * (p.x - q.x) + (p.y - q.y) * (p.y - q.y));
  }

  function bezier(t, p0, p1, p2, p3) {
    var s = 1 - t;
    var s2 = s * s,
        t2 = t * t;
    var s3 = s2 * s,
        t3 = t2 * t;
    var s2t3 = 3 * s2 * t,
        t2s3 = 3 * t2 * s;
    return new Point(s3 * p0.x + s2t3 * p1.x + t2s3 * p2.x + t3 * p3.x, s3 * p0.y + s2t3 * p1.y + t2s3 * p2.y + t3 * p3.y);
  }

  function tangent(p0, p1, p2, p3, q0, q1) {
    var A = cprod(p0, p1, q0, q1);
    var B = cprod(p1, p2, q0, q1);
    var C = cprod(p2, p3, q0, q1);
    var a = A - 2 * B + C;
    var b = -2 * A + 2 * B;
    var c = A;
    var d = b * b - 4 * a * c;

    if (a === 0 || d < 0) {
      return -1.0;
    }

    var s = Math.sqrt(d);
    var r1 = (-b + s) / (2 * a);
    var r2 = (-b - s) / (2 * a);

    if (r1 >= 0 && r1 <= 1) {
      return r1;
    } else if (r2 >= 0 && r2 <= 1) {
      return r2;
    } else {
      return -1.0;
    }
  }

  function fromImage(src, opt) {
    opt = opt || {};
    return PathList.fromBitmap(Bitmap.createFromImage(src), 'turnPolicy' in opt ? opt.turnPolicy : 4
    /* Minority */
    , 'turdSize' in opt ? opt.turdSize : 2, 'alphaMax' in opt ? opt.alphaMax : 1, 'optCurve' in opt ? opt.optCurve : true, 'optTolerance' in opt ? opt.optTolerance : 0.2);
  }

  potrace.fromImage = fromImage;

  function fromFunction(f, width, height, opt) {
    opt = opt || {};
    return PathList.fromFunction(f, width, height, 'turnPolicy' in opt ? opt.turnPolicy : 4
    /* Minority */
    , 'turdSize' in opt ? opt.turdSize : 2, 'alphaMax' in opt ? opt.alphaMax : 1, 'optCurve' in opt ? opt.optCurve : true, 'optTolerance' in opt ? opt.optTolerance : 0.2);
  }

  potrace.fromFunction = fromFunction;
})(potrace || (potrace = {}));
/*
 * Copyright 2018 WICKLETS LLC
 *
 * This file is part of Paper.js-drawing-tools.
 *
 * Paper.js-drawing-tools is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Paper.js-drawing-tools is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Paper.js-drawing-tools.  If not, see <https://www.gnu.org/licenses/>.
 */
paper.DrawingTools = class {
  constructor() {
    this._onCanvasModifiedCallback = null;
    this._onSelectionChangedCallback = null;
    this._onCanvasViewChangedCallback = null;
    this._onSelectionTransformed = null;
  }

  setup() {
    paper.project.clear();
    this._onCanvasModifiedCallback = null;
    this._onSelectionChangedCallback = null;
    this._onCanvasViewChangedCallback = null;
    this._onSelectionTransformed = null;
    this.brush = TOOL_BRUSH();
    this.cursor = TOOL_CURSOR();
    this.ellipse = TOOL_ELLIPSE();
    this.eraser = TOOL_ERASER();
    this.eyedropper = TOOL_EYEDROPPER();
    this.fillbucket = TOOL_FILLBUCKET();
    this.line = TOOL_LINE();
    this.none = TOOL_NONE();
    this.pan = TOOL_PAN();
    this.pencil = TOOL_PENCIL();
    this.rectangle = TOOL_RECTANGLE();
    this.text = TOOL_TEXT();
    this.zoom = TOOL_ZOOM();
  }

  fireCanvasModified(e) {
    this._onCanvasModifiedCallback && this._onCanvasModifiedCallback(e);
  }

  onCanvasModified(fn) {
    this._onCanvasModifiedCallback = fn;
  }

  fireSelectionChanged(e) {
    this._onSelectionChangedCallback && this._onSelectionChangedCallback(e);
  }

  onSelectionChanged(fn) {
    this._onSelectionChangedCallback = fn;
  }

  fireCanvasViewChanged(e) {
    this._onCanvasViewChangedCallback && this._onCanvasViewChangedCallback(e);
  }

  onCanvasViewChanged(fn) {
    this._onCanvasViewChangedCallback = fn;
  }

  fireSelectionTransformed(e) {
    this._onSelectionTransformedCallback && this._onSelectionTransformedCallback(e);
  }

  onSelectionTransformed(fn) {
    this._onSelectionTransformedCallback = fn;
  }

};
paper.drawingTools = new paper.DrawingTools();
/*
 * Copyright 2018 WICKLETS LLC
 *
 * This file is part of Paper.js-drawing-tools.
 *
 * Paper.js-drawing-tools is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Paper.js-drawing-tools is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Paper.js-drawing-tools.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
    paper-erase.js
    Adds erase() to the paper Layer class which erases paths in that layer using
    the shape of a given path. Use this to make a vector eraser!

    by zrispo (github.com/zrispo) (zach@wickeditor.com)
 */
(function () {
  // Splits a CompoundPath with multiple CW children into individual pieces
  function splitCompoundPath(compoundPath) {
    // Create lists of 'holes' (CCW children) and 'parts' (CW children)
    var holes = [];
    var parts = [];
    compoundPath.children.forEach(function (child) {
      if (!child.clockwise) {
        holes.push(child);
      } else {
        var part = child.clone({
          insert: false
        });
        part.fillColor = compoundPath.fillColor;
        part.insertAbove(compoundPath);
        parts.push(part);
      }
    }); // Find hole ownership for each 'part'

    parts.forEach(function (part) {
      var cmp;
      holes.forEach(function (hole) {
        if (part.bounds.contains(hole.bounds)) {
          if (!cmp) {
            cmp = new paper.CompoundPath({
              insert: false
            });
            cmp.insertAbove(part);
            cmp.addChild(part.clone({
              insert: false
            }));
          }

          cmp.addChild(hole);
        }

        if (cmp) {
          cmp.fillColor = compoundPath.fillColor;
          cmp.insertAbove(part);
          part.remove();
        }
      });
    });
    compoundPath.remove();
  }

  function eraseFill(path, eraserPath) {
    if (path.closePath) path.closePath();
    var res = path.subtract(eraserPath, {
      insert: false,
      trace: true
    });
    res.fillColor = path.fillColor;

    if (res.children) {
      res.insertAbove(path);
      res.data = {};
      path.remove();
      splitCompoundPath(res);
    } else {
      if (res.segments.length > 0) {
        res.data = {};
        res.insertAbove(path);
      }

      path.remove();
    }

    path.remove();
  }

  function eraseStroke(path, eraserPath) {
    var res = path.subtract(eraserPath, {
      insert: false,
      trace: false
    });

    if (res.children) {
      // Since the path is only strokes, it's trivial to split it into individual paths
      var children = [];
      res.children.forEach(function (child) {
        child.data = {};
        children.push(child);
        child.name = null;
      });
      children.forEach(function (child) {
        child.insertAbove(path);
      });
      res.remove();
    } else {
      res.remove();
      if (res.segments.length > 0) res.insertAbove(path);
    }

    path.remove();
  }

  function splitPath(path) {
    var fill = path.clone({
      insert: false
    });
    fill.name = null;
    fill.strokeColor = null;
    fill.strokeWidth = 1;
    var stroke = path.clone({
      insert: false
    });
    stroke.name = null;
    stroke.fillColor = null;
    fill.insertAbove(path);
    stroke.insertAbove(fill);
    path.remove();
    return {
      fill: fill,
      stroke: stroke
    };
  }

  function eraseWithPath(eraserPath) {
    var touchingPaths = [];
    this.children.forEach(function (child) {
      if (eraserPath.bounds.intersects(child.bounds)) {
        touchingPaths.push(child);
      }
    });
    touchingPaths.filter(path => {
      return path instanceof paper.Path || path instanceof paper.CompoundPath;
    }).forEach(path => {
      if (path.strokeColor && path.fillColor) {
        var res = splitPath(path);
        eraseFill(res.fill, eraserPath);
        eraseStroke(res.stroke, eraserPath);
      } else if (path.fillColor) {
        eraseFill(path, eraserPath);
      } else if (path.strokeColor) {
        eraseStroke(path, eraserPath);
      }
    });
  }

  paper.Layer.inject({
    erase: eraseWithPath
  });
})();
/*
 * Copyright 2018 WICKLETS LLC
 *
 * This file is part of Paper.js-drawing-tools.
 *
 * Paper.js-drawing-tools is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Paper.js-drawing-tools is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Paper.js-drawing-tools.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
    paper-hole.js
    Adds hole() to the paper Layer class which finds the shape of the hole
    at a certain point. Use this to make a vector fill bucket!

    This version uses a flood fill + potrace method of filling holes.

    Adapted from the FillBucket tool from old Wick

    by zrispo (github.com/zrispo) (zach@wickeditor.com)
 */
(function () {
  var VERBOSE = false;
  var PREVIEW_IMAGE = false;
  var onError;
  var onFinish;
  var layer;
  var layerGroup;
  var layerPathsGroup;
  var layerPathsRaster;
  var layerPathsImageData;
  var layerPathsImageDataFloodFilled;
  var layerPathsImageDataFloodFilledAndProcessed;
  var layerPathsImageFloodFilledAndProcessed;
  var floodFillX;
  var floodFillY;
  var floodFillCanvas;
  var floodFillCtx;
  var floodFillImageData;
  var floodFillProcessedImage;
  var resultHolePath;
  var N_RASTER_CLONE = 1;
  var RASTER_BASE_RESOLUTION = 1.75;
  var FILL_TOLERANCE = 35;
  var CLONE_WIDTH_SHRINK = 1.0;
  var SHRINK_AMT = 2.5;

  function tryToChangeColorOfExistingShape() {}

  function createLayerPathsGroup(callback) {
    layerGroup = new paper.Group({
      insert: false
    });
    layer.children.forEach(function (child) {
      if (child._class !== 'Path' && child._class !== 'CompoundPath') return;

      for (var i = 0; i < N_RASTER_CLONE; i++) {
        var clone = child.clone({
          insert: false
        });
        clone.strokeWidth *= CLONE_WIDTH_SHRINK;
        layerGroup.addChild(clone);
      }
    });

    if (layerGroup.children.length === 0) {
      onError('NO_PATHS');
    } else {
      callback();
    }
  }

  function rasterizeLayerGroup() {
    var rasterResolution = paper.view.resolution * RASTER_BASE_RESOLUTION / window.devicePixelRatio;
    layerPathsRaster = layerGroup.rasterize(rasterResolution, {
      insert: false
    });
  }

  function generateImageDataFromRaster() {
    var rasterCanvas = layerPathsRaster.canvas;
    var rasterCtx = rasterCanvas.getContext('2d');
    layerPathsImageData = rasterCtx.getImageData(0, 0, layerPathsRaster.width, layerPathsRaster.height);
  }

  function floodfillImageData(callback) {
    var rasterPosition = layerPathsRaster.bounds.topLeft;
    var x = (floodFillX - rasterPosition.x) * RASTER_BASE_RESOLUTION;
    var y = (floodFillY - rasterPosition.y) * RASTER_BASE_RESOLUTION;
    x = Math.round(x);
    y = Math.round(y);
    floodFillCanvas = document.createElement('canvas');
    floodFillCanvas.width = layerPathsRaster.canvas.width;
    floodFillCanvas.height = layerPathsRaster.canvas.height;

    if (x < 0 || y < 0 || x >= floodFillCanvas.width || y >= floodFillCanvas.height) {
      onError('OUT_OF_BOUNDS');
    } else {
      floodFillCtx = floodFillCanvas.getContext('2d');
      floodFillCtx.putImageData(layerPathsImageData, 0, 0);
      floodFillCtx.fillStyle = "rgba(123,124,125,1)";
      floodFillCtx.fillFlood(x, y, FILL_TOLERANCE);
      floodFillImageData = floodFillCtx.getImageData(0, 0, floodFillCanvas.width, floodFillCanvas.height);
      callback();
    }
  }

  function processImageData(callback) {
    var imageDataRaw = floodFillImageData.data;

    for (var i = 0; i < imageDataRaw.length; i += 4) {
      if (imageDataRaw[i] === 123 && imageDataRaw[i + 1] === 124 && imageDataRaw[i + 2] === 125) {
        imageDataRaw[i] = 0;
        imageDataRaw[i + 1] = 0;
        imageDataRaw[i + 2] = 0;
        imageDataRaw[i + 3] = 255;
      } else if (imageDataRaw[i + 3] !== 0) {
        imageDataRaw[i] = 255;
        imageDataRaw[i + 1] = 0;
        imageDataRaw[i + 2] = 0;
        imageDataRaw[i + 3] = 255;
      } else {
        imageDataRaw[i] = 1;
        imageDataRaw[i + 1] = 0;
        imageDataRaw[i + 2] = 0;
        imageDataRaw[i + 3] = 0;
      }
    }

    var w = floodFillCanvas.width;
    var h = floodFillCanvas.height;
    var r = 4;

    for (var this_x = 0; this_x < w; this_x++) {
      for (var this_y = 0; this_y < h; this_y++) {
        var thisPix = getPixelAt(this_x, this_y, w, h, imageDataRaw);

        if (thisPix && thisPix.r === 255) {
          for (var offset_x = -r; offset_x <= r; offset_x++) {
            for (var offset_y = -r; offset_y <= r; offset_y++) {
              var other_x = this_x + offset_x;
              var other_y = this_y + offset_y;
              var otherPix = getPixelAt(other_x, other_y, w, h, imageDataRaw);

              if (otherPix && otherPix.r === 0) {
                setPixelAt(this_x, this_y, w, h, imageDataRaw, {
                  r: 1,
                  g: 255,
                  b: 0,
                  a: 255
                });
              }
            }
          }
        }
      }
    }

    for (var i = 0; i < imageDataRaw.length; i += 4) {
      if (imageDataRaw[i] === 255) {
        imageDataRaw[i] = 0;
        imageDataRaw[i + 1] = 0;
        imageDataRaw[i + 2] = 0;
        imageDataRaw[i + 3] = 0;
      }
    }

    floodFillCtx.putImageData(floodFillImageData, 0, 0);
    floodFillProcessedImage = new Image();

    floodFillProcessedImage.onload = function () {
      if (PREVIEW_IMAGE) previewImage(floodFillProcessedImage);
      callback();
    };

    floodFillProcessedImage.src = floodFillCanvas.toDataURL();
  }

  function checkForLeakyHole(callback) {
    var holeIsLeaky = false;
    var w = floodFillProcessedImage.width;
    var h = floodFillProcessedImage.height;

    for (var x = 0; x < floodFillProcessedImage.width; x++) {
      if (getPixelAt(x, 0, w, h, floodFillImageData.data).r === 0 && getPixelAt(x, 0, w, h, floodFillImageData.data).a === 255) {
        holeIsLeaky = true;
        onError('LEAKY_HOLE');
        break;
      }
    }

    if (!holeIsLeaky) {
      callback();
    }
  }

  function potraceImageData() {
    var svgString = potrace.fromImage(floodFillProcessedImage).toSVG(1);
    var xmlString = svgString,
        parser = new DOMParser(),
        doc = parser.parseFromString(xmlString, "text/xml");
    resultHolePath = paper.project.importSVG(doc, {
      insert: true
    });
    resultHolePath.remove();
    resultHolePath = resultHolePath.children[0];
  }

  function processFinalResultPath() {
    resultHolePath.scale(1 / RASTER_BASE_RESOLUTION, new paper.Point(0, 0));
    var rasterPosition = layerPathsRaster.bounds.topLeft;
    resultHolePath.position.x += rasterPosition.x;
    resultHolePath.position.y += rasterPosition.y;
    expandHole(resultHolePath);
  }
  /* Utilities */


  function getPixelAt(x, y, width, height, imageData) {
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    var offset = (y * width + x) * 4;
    return {
      r: imageData[offset],
      g: imageData[offset + 1],
      b: imageData[offset + 2],
      a: imageData[offset + 3]
    };
  }

  function setPixelAt(x, y, width, height, imageData, color) {
    var offset = (y * width + x) * 4;
    imageData[offset] = color.r;
    imageData[offset + 1] = color.g;
    imageData[offset + 2] = color.b;
    imageData[offset + 3] = color.a;
  } // http://www.felixeve.co.uk/how-to-rotate-a-point-around-an-origin-with-javascript/


  function rotate_point(pointX, pointY, originX, originY, angle) {
    angle = angle * Math.PI / 180.0;
    return {
      x: Math.cos(angle) * (pointX - originX) - Math.sin(angle) * (pointY - originY) + originX,
      y: Math.sin(angle) * (pointX - originX) + Math.cos(angle) * (pointY - originY) + originY
    };
  }

  function previewImage(image) {
    var win = window.open('', 'Title', 'toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=yes, resizable=yes, width=' + image.width + ', height=' + image.height + ', top=100, left=100');
    win.document.body.innerHTML = '<div><img src= ' + image.src + '></div>';
  }

  function expandHole(path) {
    if (path instanceof paper.Group) {
      path = path.children[0];
    }

    var children;

    if (path instanceof paper.Path) {
      children = [path];
    } else if (path instanceof paper.CompoundPath) {
      children = path.children;
    }

    children.forEach(function (hole) {
      var normals = [];
      hole.closePath();
      hole.segments.forEach(function (segment) {
        var a = segment.previous.point;
        var b = segment.point;
        var c = segment.next.point;
        var ab = {
          x: b.x - a.x,
          y: b.y - a.y
        };
        var cb = {
          x: b.x - c.x,
          y: b.y - c.y
        };
        var d = {
          x: ab.x - cb.x,
          y: ab.y - cb.y
        };
        d.h = Math.sqrt(d.x * d.x + d.y * d.y);
        d.x /= d.h;
        d.y /= d.h;
        d = rotate_point(d.x, d.y, 0, 0, 90);
        normals.push({
          x: d.x,
          y: d.y
        });
      });

      for (var i = 0; i < hole.segments.length; i++) {
        var segment = hole.segments[i];
        var normal = normals[i];
        segment.point.x += normal.x * -SHRINK_AMT;
        segment.point.y += normal.y * -SHRINK_AMT;
      }
    });
  }
  /* Add hole() to paper.Layer */


  paper.Layer.inject({
    hole: function (args) {
      if (!args) console.error('paper.hole: args is required');
      if (!args.point) console.error('paper.hole: args.point is required');
      if (!args.onFinish) console.error('paper.hole: args.onFinish is required');
      if (!args.onError) console.error('paper.hole: args.onError is required');
      onFinish = args.onFinish;
      onError = args.onError;
      layer = this;
      floodFillX = args.point.x;
      floodFillY = args.point.y;
      tryToChangeColorOfExistingShape();
      createLayerPathsGroup(function () {
        rasterizeLayerGroup();
        generateImageDataFromRaster();
        floodfillImageData(function () {
          processImageData(function () {
            checkForLeakyHole(function () {
              potraceImageData();
              processFinalResultPath();
              onFinish(resultHolePath);
            });
          });
        });
      });
    }
  });
})();
/*
 * Copyright 2018 WICKLETS LLC
 *
 * This file is part of Paper.js-drawing-tools.
 *
 * Paper.js-drawing-tools is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Paper.js-drawing-tools is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Paper.js-drawing-tools.  If not, see <https://www.gnu.org/licenses/>.
 */
paper.SelectionBox = class {
  /*
   *
   */
  constructor() {
    this._start = new paper.Point();
    this._end = new paper.Point();
    this._items = [];
    this._active = false;
    this._box = new paper.Path.Rectangle();
    this._mode = 'intersects';
  }
  /*
   *
   */


  start(point) {
    this._active = true;
    this._start = point;
    this._end = point;

    this._rebuildBox();
  }
  /*
   *
   */


  drag(point) {
    this._end = point;

    this._rebuildBox();
  }
  /*
   *
   */


  end(point) {
    this._end = point;
    this._active = false;

    this._rebuildBox();

    this._box.remove();

    this._items = this._itemsInBox(this._box);
  }
  /*
   *
   */


  get items() {
    return this._items;
  }
  /*
   *
   */


  get active() {
    return this._active;
  }
  /*
   *
   */


  get mode() {
    return this._mode;
  }

  set mode(mode) {
    if (mode !== 'contains' && mode !== 'intersects') {
      throw new Error("SelectionBox.mode: invalid mode");
    }

    this._mode = mode;
  }

  _rebuildBox() {
    this._box.remove();

    this._box = new paper.Path.Rectangle({
      from: this._start,
      to: this._end,
      strokeWidth: 1,
      strokeColor: 'black'
    });
  }

  _itemsInBox(box) {
    var checkItems = [];

    this._getSelectableLayers().forEach(layer => {
      layer.children.forEach(child => {
        checkItems.push(child);
      });
    });

    var items = [];
    checkItems.forEach(item => {
      if (this.mode === 'contains') {
        if (this._box.bounds.contains(item.bounds)) {
          items.push(item);
        }
      } else if (this.mode === 'intersects') {
        if (this._shapesIntersect(item, this._box)) {
          items.push(item);
        }
      }
    });
    return items;
  }

  _shapesIntersect(itemA, itemB) {
    if (itemA instanceof paper.Group) {
      var intersects = false;
      var itemBClone = itemB.clone();
      itemBClone.transform(itemA.matrix.inverted());
      itemA.children.forEach(child => {
        if (!intersects && this._shapesIntersect(child, itemBClone)) {
          intersects = true;
        }
      });
      return intersects;
    } else {
      var shapesDoIntersect = itemB.intersects(itemA);
      var boundsContain = itemB.bounds.contains(itemA.bounds);

      if (shapesDoIntersect || boundsContain) {
        return true;
      }
    }
  }

  _getSelectableLayers() {
    var self = this;
    return paper.project.layers.filter(layer => {
      return !layer.locked;
    });
  }

};
/*
 * Copyright 2018 WICKLETS LLC
 *
 * This file is part of Paper.js-drawing-tools.
 *
 * Paper.js-drawing-tools is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Paper.js-drawing-tools is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Paper.js-drawing-tools.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
    paper-potrace.js
    Adds a potrace() method to paper Items that runs potrace on a rasterized
    version of that Item.

    by zrispo (github.com/zrispo) (zach@wickeditor.com)
 */
paper.Path.inject({
  potrace: function (args) {
    var self = this;
    if (!args) throw new Error('Path.potrace: args is required.');
    if (!args.resolution) throw new Error('Path.potrace: args.resolution is required.');
    if (!args.done) throw new Error('Path.potrace: args.done is required.');
    var finalRasterResolution = paper.view.resolution * args.resolution / window.devicePixelRatio;
    var raster = this.rasterize(finalRasterResolution);
    raster.remove();
    var rasterDataURL = raster.toDataURL();

    if (rasterDataURL === 'data:,') {
      args.done(null);
    } // https://oov.github.io/potrace/


    var img = new Image();

    img.onload = function () {
      var svg = potrace.fromImage(img).toSVG(1 / args.resolution);
      var potracePath = paper.project.importSVG(svg);
      potracePath.position.x = self.position.x;
      potracePath.position.y = self.position.y;
      potracePath.remove();
      potracePath.closed = true;
      potracePath.children[0].closed = true;
      args.done(potracePath.children[0]);
    };

    img.src = rasterDataURL;
  }
});
/*
 * Copyright 2018 WICKLETS LLC
 *
 * This file is part of Paper.js-drawing-tools.
 *
 * Paper.js-drawing-tools is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Paper.js-drawing-tools is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Paper.js-drawing-tools.  If not, see <https://www.gnu.org/licenses/>.
 */
(function () {
  var editElem = $('<textarea style="resize: none;">');
  editElem.css('position', 'absolute');
  editElem.css('width', '100px');
  editElem.css('height', '100px');
  editElem.css('left', '0px');
  editElem.css('top', '0px');
  editElem.css('resize', 'none');
  editElem.css('line-height', '1.2');
  editElem.css('background-color', '#ffffff');
  editElem.css('box-sizing', 'content-box');
  editElem.css('-moz-box-sizing', 'content-box');
  editElem.css('-webkit-box-sizing', 'content-box');
  editElem.css('border', 'none');
  paper.TextItem.inject({
    attachTextArea: function () {
      $(paper.view.element.offsetParent).append(editElem);
      editElem.focus();
      var clone = this.clone();
      clone.rotation = 0;
      clone.scaling = new paper.Point(1, 1);
      clone.remove();
      var width = clone.bounds.width * paper.view.zoom;
      var height = clone.bounds.height * paper.view.zoom;
      editElem.css('width', width + 'px');
      editElem.css('height', height + 'px');
      editElem.css('outline', 1 * paper.view.zoom + 'px dashed black');
      var position = paper.view.projectToView(clone.bounds.topLeft.x, clone.bounds.topLeft.y);
      var scale = this.scaling;
      var rotation = this.rotation;
      var fontSize = this.fontSize * paper.view.zoom;
      var fontFamily = this.fontFamily;
      var content = this.content;
      editElem.css('font-family', fontFamily);
      editElem.css('font-size', fontSize);
      editElem.val(content);
      var transformString = '';
      transformString += 'translate(' + position.x + 'px,' + position.y + 'px) ';
      transformString += 'rotate(' + rotation + 'deg) ';
      transformString += 'scale(' + scale.x + ',' + scale.y + ') ';
      editElem.css('transform', transformString);
    },
    edit: function () {
      this.attachTextArea();
      var self = this;

      editElem[0].oninput = function () {
        self.content = editElem[0].value;
        self.attachTextArea();
      };
    },
    finishEditing: function () {
      editElem.remove();
    }
  });
})();
/*
 * Copyright 2018 WICKLETS LLC
 *
 * This file is part of Paper.js-drawing-tools.
 *
 * Paper.js-drawing-tools is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Paper.js-drawing-tools is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Paper.js-drawing-tools.  If not, see <https://www.gnu.org/licenses/>.
 */
paper.View.inject({
  pressure: 1,
  enablePressure: function (args) {
    let self = this;
    let MIN_PRESSURE = 0.14;
    $(this.element.parentElement).pressure({
      change: function (force, event) {
        self.pressure = $.pressureMap(force, 0.0, 1.0, MIN_PRESSURE, 1.0);
      },
      end: function () {
        self.pressure = 1.0;
      }
    }, {
      polyfill: false
    });
  }
});
/*
 * Copyright 2018 WICKLETS LLC
 *
 * This file is part of Paper.js-drawing-tools.
 *
 * Paper.js-drawing-tools is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Paper.js-drawing-tools is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Paper.js-drawing-tools.  If not, see <https://www.gnu.org/licenses/>.
 */
paper.View.inject({
  enableGestures: function (args) {// TODO
  }
});
/*
 * Copyright 2018 WICKLETS LLC
 *
 * This file is part of Paper.js-drawing-tools.
 *
 * Paper.js-drawing-tools is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Paper.js-drawing-tools is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Paper.js-drawing-tools.  If not, see <https://www.gnu.org/licenses/>.
 */
paper.View.inject({
  enableScrollToZoom: function (args) {// TODO
  }
});
/*
 * Copyright 2018 WICKLETS LLC
 *
 * This file is part of Paper.js-drawing-tools.
 *
 * Paper.js-drawing-tools is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Paper.js-drawing-tools is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Paper.js-drawing-tools.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
    Brush Cursor Generator
    For creating Flash-like cursors for drawing tools

    by zrispo (github.com/zrispo) (zach@wickeditor.com)
 */
class BrushCursorGen {
  static create(color, size) {
    var canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    var context = canvas.getContext('2d');
    var centerX = canvas.width / 2;
    var centerY = canvas.height / 2;
    var radius = size / 2;
    context.beginPath();
    context.arc(centerX, centerY, radius + 1, 0, 2 * Math.PI, false);
    context.fillStyle = invert(color);
    context.fill();
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
    context.fillStyle = color;
    context.fill();
    return 'url(' + canvas.toDataURL() + ') 64 64,default';
  }

}
/*
 * Copyright 2018 WICKLETS LLC
 *
 * This file is part of Paper.js-drawing-tools.
 *
 * Paper.js-drawing-tools is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Paper.js-drawing-tools is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Paper.js-drawing-tools.  If not, see <https://www.gnu.org/licenses/>.
 */
var TOOL_BRUSH = () => {
  var croquis;
  var croquisDOMElement;
  var croquisBrush;
  var cursor;
  var lastPressure;
  var tool = new paper.Tool();
  tool.pressureEnabled = true;
  tool.brushSize = 10;
  tool.brushStabilizerLevel = 3;
  tool.brushStabilizerWeight = 0.5;
  tool.potraceResolution = 1.0;
  tool.fillColor = '#000000';
  var BRUSH_POINT_SPACING = 0.2;

  tool.onActivate = function (e) {
    if (!croquis) {
      croquis = new Croquis();
      croquis.setCanvasSize(500, 500);
      croquis.addLayer();
      croquis.fillLayer('rgba(0,0,0,0)');
      croquis.addLayer();
      croquis.selectLayer(1);
      croquisBrush = new Croquis.Brush();
      croquis.setTool(croquisBrush);
      croquisDOMElement = croquis.getDOMElement();
      croquisDOMElement.style.position = 'absolute';
      croquisDOMElement.style.left = '0px';
      croquisDOMElement.style.top = '0px';
      croquisDOMElement.style.width = '100%';
      croquisDOMElement.style.height = '100%';
      croquisDOMElement.style.display = 'block';
      croquisDOMElement.style.pointerEvents = 'none';
    }
  };

  tool.getPressure = function () {
    return tool.pressureEnabled ? paper.view.pressure : 1;
  };

  tool.onDeactivate = function (e) {};

  tool.onMouseMove = function (e) {
    // Update croquis element and pressure options
    if (!paper.view._element.parentElement.contains(croquisDOMElement)) {
      paper.view.enablePressure();

      paper.view._element.parentElement.appendChild(croquisDOMElement);
    }

    if (croquis.getCanvasWidth() !== paper.view._element.width || croquis.getCanvasHeight() !== paper.view._element.height) {
      croquis.setCanvasSize(paper.view._element.width, paper.view._element.height);
    }

    cursor = BrushCursorGen.create(tool.fillColor, tool.brushSize * tool.getPressure());
    paper.view._element.style.cursor = cursor;
  };

  tool.onMouseDown = function (e) {
    croquisBrush.setSize(tool.brushSize);
    croquisBrush.setColor(tool.fillColor);
    croquisBrush.setSpacing(BRUSH_POINT_SPACING);
    croquis.setToolStabilizeLevel(tool.brushStabilizerLevel);
    croquis.setToolStabilizeWeight(tool.brushStabilizerWeight);
    var point = paper.view.projectToView(e.point.x, e.point.y);

    try {
      croquis.down(point.x, point.y, tool.getPressure());
    } catch (e) {
      console.log(e);
    }
  };

  tool.onMouseDrag = function (e) {
    var point = paper.view.projectToView(e.point.x, e.point.y);

    try {
      croquis.move(point.x, point.y, tool.getPressure());
    } catch (e) {
      console.log(e);
    }

    lastPressure = tool.getPressure();
    cursor = BrushCursorGen.create(tool.fillColor, tool.brushSize * tool.getPressure());
    paper.view._element.style.cursor = cursor;
  };

  tool.onMouseUp = function (e) {
    var point = paper.view.projectToView(e.point.x, e.point.y);

    try {
      croquis.up(point.x, point.y, lastPressure);
    } catch (e) {
      return;
    }

    setTimeout(function () {
      var img = new Image();

      img.onload = function () {
        var svg = potrace.fromImage(img).toSVG(1 / tool.potraceResolution / paper.view.zoom);
        var potracePath = paper.project.importSVG(svg);
        potracePath.fillColor = tool.fillColor;
        potracePath.position.x += paper.view.bounds.x;
        potracePath.position.y += paper.view.bounds.y;
        potracePath.remove();
        potracePath.closed = true;
        potracePath.children[0].closed = true;
        paper.project.activeLayer.addChild(potracePath.children[0]);
        croquis.clearLayer();
        paper.drawingTools.fireCanvasModified({
          layers: [paper.project.activeLayer]
        });
      };

      var canvas = document.getElementsByClassName('croquis-layer-canvas')[1];
      var resizedCanvas = document.createElement("canvas");
      var resizedContext = resizedCanvas.getContext("2d");
      resizedCanvas.width = canvas.width * tool.potraceResolution;
      resizedCanvas.height = canvas.height * tool.potraceResolution;
      resizedContext.drawImage(canvas, 0, 0, resizedCanvas.width, resizedCanvas.height);
      img.src = resizedCanvas.toDataURL();
    }, 20);
  };

  return tool;
};
/*
 * Copyright 2018 WICKLETS LLC
 *
 * This file is part of Paper.js-drawing-tools.
 *
 * Paper.js-drawing-tools is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Paper.js-drawing-tools is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Paper.js-drawing-tools.  If not, see <https://www.gnu.org/licenses/>.
 */
var TOOL_CURSOR = () => {
  var SELECTION_TOLERANCE = 3;
  var CURSOR_DEFAULT = 'cursors/default.png';
  var CURSOR_SCALE_TOP_RIGHT_BOTTOM_LEFT = 'cursors/scale-top-right-bottom-left.png';
  var CURSOR_SCALE_TOP_LEFT_BOTTOM_RIGHT = 'cursors/scale-top-left-bottom-right.png';
  var CURSOR_SCALE_VERTICAL = 'cursors/scale-vertical.png';
  var CURSOR_SCALE_HORIZONTAL = 'cursors/scale-horizontal.png';
  var CURSOR_ROTATE_TOP = 'cursors/rotate-top.png';
  var CURSOR_ROTATE_RIGHT = 'cursors/rotate-right.png';
  var CURSOR_ROTATE_BOTTOM = 'cursors/rotate-bottom.png';
  var CURSOR_ROTATE_LEFT = 'cursors/rotate-left.png';
  var CURSOR_ROTATE_TOP_RIGHT = 'cursors/rotate-top-right.png';
  var CURSOR_ROTATE_TOP_LEFT = 'cursors/rotate-top-left.png';
  var CURSOR_ROTATE_BOTTOM_RIGHT = 'cursors/rotate-bottom-right.png';
  var CURSOR_ROTATE_BOTTOM_LEFT = 'cursors/rotate-bottom-left.png';
  var CURSOR_MOVE = 'cursors/move.png';
  var CURSOR_SEGMENT = 'cursors/segment.png';
  var CURSOR_CURVE = 'cursors/curve.png';
  var HOVER_PREVIEW_SEGMENT_STROKE_COLOR = 'rgba(100,150,255,1.0)';
  var HOVER_PREVIEW_SEGMENT_STROKE_WIDTH = 1.5;
  var HOVER_PREVIEW_SEGMENT_FILL_COLOR = '#ffffff';
  var HOVER_PREVIEW_SEGMENT_RADIUS = 5;
  var HOVER_PREVIEW_CURVE_STROKE_WIDTH = 2;
  var HOVER_PREVIEW_CURVE_STROKE_COLOR = HOVER_PREVIEW_SEGMENT_STROKE_COLOR;
  var hitResult = new paper.HitResult();
  var selectionBox = new paper.SelectionBox();
  var draggingCurve = new paper.Curve();
  var draggingSegment = new paper.Segment();
  var hoverPreview = new paper.Item({
    insert: false
  });
  var tool = new paper.Tool();
  tool.selectPoints = true;
  tool.selectCurves = true;

  tool.onActivate = function (e) {
    selectedItems = [];
  };

  tool.onDeactivate = function (e) {};

  tool.onMouseMove = function (e) {
    // Remove the hover preview, a new one will be generated if needed
    hoverPreview.remove(); // Find the thing that is currently under the cursor.

    hitResult = _updateHitResult(e); // Update the image being used for the cursor

    _setCursor(_getCursor());

    if (hitResult.type === 'segment' && !hitResult.item.data.isSelectionBoxGUI) {
      // Hovering over a segment, draw a circle where the segment is
      hoverPreview = new paper.Path.Circle(hitResult.segment.point, HOVER_PREVIEW_SEGMENT_RADIUS / paper.view.zoom);
      hoverPreview.strokeColor = HOVER_PREVIEW_SEGMENT_STROKE_COLOR;
      hoverPreview.strokeWidth = HOVER_PREVIEW_SEGMENT_STROKE_WIDTH;
      hoverPreview.fillColor = HOVER_PREVIEW_SEGMENT_FILL_COLOR;
    } else if (hitResult.type === 'curve' && !hitResult.item.data.isSelectionBoxGUI) {
      // Hovering over a curve, render a copy of the curve that can be bent
      hoverPreview = new paper.Path();
      hoverPreview.strokeWidth = HOVER_PREVIEW_CURVE_STROKE_WIDTH;
      hoverPreview.strokeColor = HOVER_PREVIEW_CURVE_STROKE_COLOR;
      hoverPreview.add(new paper.Point(hitResult.location.curve.point1));
      hoverPreview.add(new paper.Point(hitResult.location.curve.point2));
      hoverPreview.segments[0].handleOut = hitResult.location.curve.handle1;
      hoverPreview.segments[1].handleIn = hitResult.location.curve.handle2;
    }
  };

  tool.onMouseDown = function (e) {
    hitResult = _updateHitResult(e);

    if (hitResult.item && hitResult.item.data.isSelectionBoxGUI) {// The selection box was clicked
    } else if (paper.selection.isItemSelected(hitResult.item)) {
      // We clicked something that was already selected.
      // Shift click: Deselect that item
      if (e.modifiers.shift) {
        var itemsWithoutHitItem = paper.selection.items.filter(item => {
          return item !== hitResult.item;
        });
        paper.drawingTools.fireSelectionChanged({
          items: itemsWithoutHitItem
        });
      }
    } else if (hitResult.item && hitResult.type === 'fill') {
      // Clicked an item: select that item
      var items = [hitResult.item]; // Shift click? Keep everything else selected.

      if (e.modifiers.shift) items = items.concat(paper.selection.items);
      paper.drawingTools.fireSelectionChanged({
        items: items
      });
    } else if (hitResult.item && hitResult.type === 'curve') {
      // Clicked a curve, start dragging it
      draggingCurve = hitResult.location.curve;
    } else if (hitResult.item && hitResult.type === 'segment') {} else {
      // Nothing was clicked, so clear the selection and start a new selection box
      paper.selection.finish();
      paper.drawingTools.fireSelectionChanged({
        items: []
      });
      paper.drawingTools.fireCanvasModified();
      selectionBox.start(e.point);
    }
  };

  tool.onMouseDrag = function (e) {
    if (hitResult.item && hitResult.item.data.isSelectionBoxGUI) {
      // Drag a handle of the selection box.
      // These can scale and rotate the selection.
      paper.selection.handleDragMode = hitResult.item.data.handleType;
      paper.selection[hitResult.item.data.handleEdge] = e.point;
    } else if (selectionBox.active) {
      // Selection box is being used, update it with a new point
      selectionBox.drag(e.point);
    } else if (hitResult.item && hitResult.type === 'fill') {
      // We're dragging the selection itself, so move the whole item.
      paper.selection.x += e.delta.x;
      paper.selection.y += e.delta.y;
    } else if (hitResult.item && hitResult.type === 'segment') {
      // We're dragging an individual point, so move the point.
      hitResult.segment.point = hitResult.segment.point.add(e.delta);
      hoverPreview.position = hitResult.segment.point;
    } else if (hitResult.item && hitResult.type === 'curve') {
      // We're dragging a curve, so bend the curve.
      var segment1 = draggingCurve.segment1;
      var segment2 = draggingCurve.segment2;
      var handleIn = segment1.handleOut;
      var handleOut = segment2.handleIn;

      if (handleIn.x === 0 && handleIn.y === 0) {
        handleIn.x = (segment2.point.x - segment1.point.x) / 4;
        handleIn.y = (segment2.point.y - segment1.point.y) / 4;
      }

      if (handleOut.x === 0 && handleOut.y === 0) {
        handleOut.x = (segment1.point.x - segment2.point.x) / 4;
        handleOut.y = (segment1.point.y - segment2.point.y) / 4;
      }

      handleIn.x += e.delta.x;
      handleIn.y += e.delta.y;
      handleOut.x += e.delta.x;
      handleOut.y += e.delta.y; // Update the hover preview to match the curve we just changed

      hoverPreview.segments[0].handleOut = draggingCurve.handle1;
      hoverPreview.segments[1].handleIn = draggingCurve.handle2;
    }
  };

  tool.onMouseUp = function (e) {
    if (selectionBox.active) {
      // Finish selection box and select objects touching box (or inside box, if alt is held)
      selectionBox.mode = e.modifiers.alt ? 'contains' : 'intersects';
      selectionBox.end(e.point);
      paper.drawingTools.fireSelectionChanged({
        items: selectionBox.items
      });
    } else {
      paper.drawingTools.fireSelectionTransformed({});
    }
  };

  function _updateHitResult(e) {
    var newHitResult = paper.project.hitTest(e.point, {
      fill: true,
      stroke: true,
      curves: true,
      segments: true,
      tolerance: SELECTION_TOLERANCE,
      match: function (result) {
        return result.item !== hoverPreview;
      }
    });
    if (!newHitResult) newHitResult = new paper.HitResult();

    if (newHitResult.item && !newHitResult.item.data.isSelectionBoxGUI) {
      // You can't select children of compound paths, you can only select the whole thing.
      if (newHitResult.item.parent.className === 'CompoundPath') {
        newHitResult.item = newHitResult.item.parent;
      } // You can't select individual children in a group, you can only select the whole thing.


      if (newHitResult.item.parent.parent) {
        newHitResult.type = 'fill';

        while (newHitResult.item.parent.parent) {
          newHitResult.item = newHitResult.item.parent;
        }
      } // Paper.js has two names for strokes+curves, we don't need that extra info


      if (newHitResult.type === 'stroke') {
        newHitResult.type = 'curve';
      } // Mousing over rasters acts the same as mousing over fills.


      if (newHitResult.type === 'pixel') {
        newHitResult.type = 'fill';
      } // Disable curve selection unless selectCurves is true.


      if (!tool.selectCurves && newHitResult.type === 'curve') {
        newHitResult.type = 'fill';
      } // Disable segment selection unless selectPoints is true.


      if (!tool.selectPoints && newHitResult.type === 'segment') {
        newHitResult.type = 'fill';
      } // You can't drag segments and curves of a selected object.


      if (paper.selection.isItemSelected(newHitResult.item)) {
        newHitResult.type = 'fill';
      }
    }

    return newHitResult;
  }

  function _getCursor() {
    if (!hitResult.item) {
      return CURSOR_DEFAULT;
    } else if (hitResult.item.data.isSelectionBoxGUI) {
      // Don't show any custom cursor if the mouse is over the border, the border does nothing
      if (hitResult.item.name === 'border') {
        return CURSOR_DEFAULT;
      } // Calculate the angle in which the scale handle scales the selection.
      // Use that angle to determine the cursor graphic to use.
      // Here is a handy diagram showing the cursors that correspond to the angles:
      // 315       0       45
      //     o-----o-----o
      //     |           | 
      //     |           | 
      // 270 o           o 90
      //     |           |
      //     |           |
      //     o-----o-----o
      // 225      180      135


      var baseAngle = {
        topCenter: 0,
        topRight: 45,
        rightCenter: 90,
        bottomRight: 135,
        bottomCenter: 180,
        bottomLeft: 225,
        leftCenter: 270,
        topLeft: 315
      }[hitResult.item.data.handleEdge]; // Flip angles if selection is flipped horizontally/vertically

      if (paper.selection._transform.scaleX < 0) {
        baseAngle = -baseAngle + 360;
      }

      if (paper.selection._transform.scaleY < 0) {
        baseAngle = -baseAngle + 180;
      }

      var angle = baseAngle + paper.selection.rotation;
      if (angle < 0) angle += 360;
      if (angle > 360) angle -= 360; // Makes angle math easier if we dont allow angles >360 or <0 degrees
      // Round the angle to the nearest 45 degree interval. 

      var angleRoundedToNearest45 = Math.round(angle / 45) * 45;
      angleRoundedToNearest45 = Math.round(angleRoundedToNearest45); // just incase of float weirdness

      angleRoundedToNearest45 = '' + angleRoundedToNearest45; // convert to string
      // Now we know which of eight directions the handle is pointing, so we choose the correct cursor

      if (hitResult.item.data.handleType === 'scale') {
        var cursorGraphicFromAngle = {
          '0': CURSOR_SCALE_VERTICAL,
          '45': CURSOR_SCALE_TOP_RIGHT_BOTTOM_LEFT,
          '90': CURSOR_SCALE_HORIZONTAL,
          '135': CURSOR_SCALE_TOP_LEFT_BOTTOM_RIGHT,
          '180': CURSOR_SCALE_VERTICAL,
          '225': CURSOR_SCALE_TOP_RIGHT_BOTTOM_LEFT,
          '270': CURSOR_SCALE_HORIZONTAL,
          '315': CURSOR_SCALE_TOP_LEFT_BOTTOM_RIGHT,
          '360': CURSOR_SCALE_VERTICAL
        }[angleRoundedToNearest45];
        return cursorGraphicFromAngle;
      } else if (hitResult.item.data.handleType === 'rotation') {
        var cursorGraphicFromAngle = {
          '0': CURSOR_ROTATE_TOP,
          '45': CURSOR_ROTATE_TOP_RIGHT,
          '90': CURSOR_ROTATE_RIGHT,
          '135': CURSOR_ROTATE_BOTTOM_RIGHT,
          '180': CURSOR_ROTATE_BOTTOM,
          '225': CURSOR_ROTATE_BOTTOM_LEFT,
          '270': CURSOR_ROTATE_LEFT,
          '315': CURSOR_ROTATE_TOP_LEFT,
          '360': CURSOR_ROTATE_TOP
        }[angleRoundedToNearest45];
        return cursorGraphicFromAngle;
      }
    } else {
      if (hitResult.type === 'fill') {
        return CURSOR_MOVE;
      } else if (hitResult.type === 'curve') {
        return CURSOR_CURVE;
      } else if (hitResult.type === 'segment') {
        return CURSOR_SEGMENT;
      }
    }
  }

  function _setCursor(cursor) {
    paper.view._element.style.cursor = 'url("' + cursor + '") 32 32, auto';
  }

  return tool;
};
/*
 * Copyright 2018 WICKLETS LLC
 *
 * This file is part of Paper.js-drawing-tools.
 *
 * Paper.js-drawing-tools is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Paper.js-drawing-tools is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Paper.js-drawing-tools.  If not, see <https://www.gnu.org/licenses/>.
 */
var TOOL_ELLIPSE = () => {
  var path;
  var topLeft;
  var bottomRight;
  var tool = new paper.Tool();
  tool.fillColor = '#ff0000';
  tool.strokeColor = '#000000';
  tool.strokeWidth = 1;

  tool.onActivate = function (e) {};

  tool.onDeactivate = function (e) {
    if (path) {
      path.remove();
      path = null;
    }
  };

  tool.onMouseMove = function (e) {
    paper.view._element.style.cursor = 'crosshair';
  };

  tool.onMouseDown = function (e) {
    topLeft = e.point;
    bottomRight = e.point;
  };

  tool.onMouseDrag = function (e) {
    if (path) path.remove();
    bottomRight = e.point; // Lock width and height if shift is held down

    if (e.modifiers.shift) {
      var d = bottomRight.subtract(topLeft);
      var max = Math.max(Math.abs(d.x), Math.abs(d.y));
      bottomRight.x = topLeft.x + max * (d.x < 0 ? -1 : 1);
      bottomRight.y = topLeft.y + max * (d.y < 0 ? -1 : 1);
    }

    var bounds = new paper.Rectangle(new paper.Point(topLeft.x, topLeft.y), new paper.Point(bottomRight.x, bottomRight.y));
    path = new paper.Path.Ellipse(bounds);
    path.fillColor = tool.fillColor;
    path.strokeColor = tool.strokeColor;
    path.strokeWidth = tool.strokeWidth;
    path.strokeCap = 'round';
  };

  tool.onMouseUp = function (e) {
    if (!path) return;
    path = null;
    paper.drawingTools.fireCanvasModified({
      layers: [paper.project.activeLayer]
    });
  };

  return tool;
};
/*
 * Copyright 2018 WICKLETS LLC
 *
 * This file is part of Paper.js-drawing-tools.
 *
 * Paper.js-drawing-tools is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Paper.js-drawing-tools is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Paper.js-drawing-tools.  If not, see <https://www.gnu.org/licenses/>.
 */
var TOOL_ERASER = () => {
  var path;
  var cursorSize;
  var cursor;
  var tool = new paper.Tool();
  tool.brushSize = 10;

  tool.onActivate = function (e) {
    cursorSize = null;
  };

  tool.onDeactivate = function (e) {
    if (path) {
      path.remove();
      path = null;
    }
  };

  tool.onMouseMove = function (e) {
    // Don't render cursor after every mouse move, cache and only render when size changes
    var cursorNeedsRegen = tool.brushSize !== cursorSize;

    if (cursorNeedsRegen) {
      cursor = BrushCursorGen.create('#ffffff', tool.brushSize);
      cursorSize = tool.brushSize;
      paper.view._element.style.cursor = cursor;
    }
  };

  tool.onMouseDown = function (e) {
    if (!path) {
      path = new paper.Path({
        strokeColor: 'white',
        strokeCap: 'round',
        strokeWidth: tool.brushSize / paper.view.zoom
      });
    } // Add two points so we always at least have a dot.


    path.add(e.point);
    path.add(e.point);
  };

  tool.onMouseDrag = function (e) {
    path.add(e.point);
    path.smooth();
  };

  tool.onMouseUp = function (e) {
    if (!path) return;
    var smoothing = 0.7;
    path.potrace({
      done: function (tracedPath) {
        path.remove();
        paper.project.activeLayer.erase(tracedPath, {});
        path = null;
        paper.drawingTools.fireCanvasModified({
          layers: [paper.project.activeLayer]
        });
      },
      resolution: smoothing * paper.view.zoom
    });
  };

  return tool;
};
/*
 * Copyright 2018 WICKLETS LLC
 *
 * This file is part of Paper.js-drawing-tools.
 *
 * Paper.js-drawing-tools is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Paper.js-drawing-tools is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Paper.js-drawing-tools.  If not, see <https://www.gnu.org/licenses/>.
 */
var TOOL_EYEDROPPER = () => {
  var CURSOR_EYEDROPPER = 'cursors/eyedropper.png';
  var canvasCtx;
  var hoverColor;
  var colorPreviewBorder;
  var colorPreview;

  var _colorChosenCallback;

  var tool = new paper.Tool();

  tool.onActivate = function (e) {
    canvasCtx = paper.view._element.getContext('2d');
  };

  tool.onDeactivate = function (e) {
    destroyColorPreview();
  };

  tool.onColorChosen = function (callback) {
    _colorChosenCallback = callback;
  };

  tool.onMouseMove = function (e) {
    paper.view._element.style.cursor = 'url(' + CURSOR_EYEDROPPER + ') 32 32, auto';
    destroyColorPreview();
    var pointPx = paper.view.projectToView(e.point);
    pointPx.x = Math.round(pointPx.x);
    pointPx.y = Math.round(pointPx.y);
    var colorData = canvasCtx.getImageData(pointPx.x, pointPx.y, 1, 1).data;
    hoverColor = 'rgb(' + colorData[0] + ',' + colorData[1] + ',' + colorData[2] + ')';
    createColorPreview(e.point);
  };

  tool.onMouseDown = function (e) {
    _colorChosenCallback && _colorChosenCallback({
      color: hoverColor
    });
  };

  tool.onMouseDrag = function (e) {};

  tool.onMouseUp = function (e) {};

  function createColorPreview(point) {
    var offset = 10 / paper.view.zoom;
    var center = point.add(new paper.Point(offset + 0.5, offset + 0.5));
    var radius = 10 / paper.view.zoom;
    var size = new paper.Size(radius, radius);
    colorPreviewBorder = new paper.Path.Rectangle(center, size);
    colorPreviewBorder.strokeColor = 'white';
    colorPreviewBorder.strokeWidth = 3.0 / paper.view.zoom;
    colorPreview = new paper.Path.Rectangle(center, size);
    colorPreview.strokeColor = 'black';
    colorPreview.strokeWidth = 1.0 / paper.view.zoom;
    colorPreview.fillColor = hoverColor;
  }

  function destroyColorPreview() {
    if (colorPreview) {
      colorPreview.remove();
      colorPreview = null;
      colorPreviewBorder.remove();
      colorPreviewBorder = null;
    }
  }

  return tool;
};
/*
 * Copyright 2018 WICKLETS LLC
 *
 * This file is part of Paper.js-drawing-tools.
 *
 * Paper.js-drawing-tools is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Paper.js-drawing-tools is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Paper.js-drawing-tools.  If not, see <https://www.gnu.org/licenses/>.
 */
var TOOL_FILLBUCKET = () => {
  var CURSOR_FILL_BUCKET = 'cursors/fillbucket.png';
  var tool = new paper.Tool();
  tool.fillColor = '#ff0000';

  tool.onActivate = function (e) {};

  tool.onDeactivate = function (e) {};

  tool.onMouseMove = function (e) {
    paper.view._element.style.cursor = 'url(' + CURSOR_FILL_BUCKET + ') 32 32, auto';
  };

  tool.onMouseDown = function (e) {
    var hitResult = paper.project.activeLayer.hitTest(e.point, {
      fill: true
    });

    if (hitResult && hitResult.item) {
      hitResult.item.fillColor = tool.fillColor;
      paper.drawingTools.fireCanvasModified({
        layers: [paper.project.activeLayer]
      });
    } else {
      setTimeout(function () {
        paper.view._element.style.cursor = 'wait';
      }, 0);
      setTimeout(function () {
        paper.project.activeLayer.hole({
          point: e.point,
          onFinish: function (path) {
            paper.view._element.style.cursor = 'default';

            if (path) {
              path.fillColor = tool.fillColor;
              path.name = null;
              paper.project.activeLayer.addChild(path);
              paper.drawingTools.fireCanvasModified({
                layers: [paper.project.activeLayer]
              });
            }
          },
          onError: function (message) {
            paper.view._element.style.cursor = 'default';
            console.log("Fill bucket onError: " + message);
          }
        });
      }, 50);
    }
  };

  tool.onMouseDrag = function (e) {};

  tool.onMouseUp = function (e) {};

  return tool;
};
/*
 * Copyright 2018 WICKLETS LLC
 *
 * This file is part of Paper.js-drawing-tools.
 *
 * Paper.js-drawing-tools is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Paper.js-drawing-tools is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Paper.js-drawing-tools.  If not, see <https://www.gnu.org/licenses/>.
 */
var TOOL_LINE = () => {
  var path;
  var startPoint;
  var endPoint;
  var tool = new paper.Tool();
  tool.strokeColor = '#000000';
  tool.strokeWidth = 1;

  tool.onActivate = function (e) {};

  tool.onDeactivate = function (e) {
    if (path) {
      path.remove();
      path = null;
    }
  };

  tool.onMouseMove = function (e) {
    paper.view._element.style.cursor = 'crosshair';
  };

  tool.onMouseDown = function (e) {
    startPoint = e.point;
  };

  tool.onMouseDrag = function (e) {
    if (path) {
      path.remove();
      path = null;
    }

    endPoint = e.point;
    path = new paper.Path.Line(startPoint, endPoint);
    path.strokeCap = 'round';
    path.strokeColor = tool.strokeColor;
    path.strokeWidth = tool.strokeWidth;
  };

  tool.onMouseUp = function (e) {
    if (!path) return;
    path = null;
    paper.drawingTools.fireCanvasModified({
      layers: [paper.project.activeLayer]
    });
  };

  return tool;
};
/*
 * Copyright 2018 WICKLETS LLC
 *
 * This file is part of Paper.js-drawing-tools.
 *
 * Paper.js-drawing-tools is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Paper.js-drawing-tools is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Paper.js-drawing-tools.  If not, see <https://www.gnu.org/licenses/>.
 */
var TOOL_NONE = () => {
  var tool = new paper.Tool();

  tool.onActivate = function (e) {};

  tool.onDeactivate = function (e) {};

  tool.onMouseMove = function (e) {
    paper.view._element.style.cursor = 'not-allowed';
  };

  tool.onMouseDown = function (e) {};

  tool.onMouseDrag = function (e) {};

  tool.onMouseUp = function (e) {};

  return tool;
};
/*
 * Copyright 2018 WICKLETS LLC
 *
 * This file is part of Paper.js-drawing-tools.
 *
 * Paper.js-drawing-tools is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Paper.js-drawing-tools is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Paper.js-drawing-tools.  If not, see <https://www.gnu.org/licenses/>.
 */
var TOOL_PAN = () => {
  var tool = new paper.Tool();

  tool.onActivate = function (e) {};

  tool.onDeactivate = function (e) {};

  tool.onMouseMove = function (e) {
    paper.view._element.style.cursor = 'move';
  };

  tool.onMouseDown = function (e) {};

  tool.onMouseDrag = function (e) {
    var d = e.downPoint.subtract(e.point);
    paper.view.center = paper.view.center.add(d);
  };

  tool.onMouseUp = function (e) {
    paper.drawingTools.fireCanvasViewChanged({});
  };

  return tool;
};
/*
 * Copyright 2018 WICKLETS LLC
 *
 * This file is part of Paper.js-drawing-tools.
 *
 * Paper.js-drawing-tools is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Paper.js-drawing-tools is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Paper.js-drawing-tools.  If not, see <https://www.gnu.org/licenses/>.
 */
var TOOL_PENCIL = () => {
  var CURSOR_PENCIL = 'cursors/pencil.png';
  var path;
  var lastAddedPoint;
  var tool = new paper.Tool();
  tool.strokeWidth = 1;
  tool.strokeColor = '#000000';
  tool.smoothness = 0;
  tool.simplifyAmount = 0;

  tool.onActivate = function (e) {};

  tool.onDeactivate = function (e) {};

  tool.onMouseMove = function (e) {
    paper.view._element.style.cursor = 'url(' + CURSOR_PENCIL + ') 32 32, auto';
  };

  tool.onMouseDown = function (e) {
    if (!path) {
      path = new paper.Path({
        strokeColor: tool.strokeColor,
        strokeWidth: tool.strokeWidth,
        strokeCap: 'round'
      });
    }

    path.add(e.point);
  };

  tool.onMouseDrag = function (e) {
    var d = lastAddedPoint && lastAddedPoint.subtract(e.point).length;

    if (!lastAddedPoint || d > tool.smoothness) {
      lastAddedPoint = e.point;
      path.add(e.point);
      path.smooth();
    }
  };

  tool.onMouseUp = function (e) {
    if (tool.simplifyAmount !== 0) {
      path.simplify(tool.simplifyAmount);
    }

    path = null;
    paper.drawingTools.fireCanvasModified({
      layers: [paper.project.activeLayer]
    });
  };

  return tool;
};
/*
 * Copyright 2018 WICKLETS LLC
 *
 * This file is part of Paper.js-drawing-tools.
 *
 * Paper.js-drawing-tools is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Paper.js-drawing-tools is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Paper.js-drawing-tools.  If not, see <https://www.gnu.org/licenses/>.
 */
var TOOL_RECTANGLE = () => {
  var path;
  var topLeft;
  var bottomRight;
  var tool = new paper.Tool();
  tool.fillColor = '#ff0000';
  tool.strokeColor = '#000000';
  tool.strokeWidth = 1;
  tool.cornerRadius = 0;

  tool.onActivate = function (e) {};

  tool.onDeactivate = function (e) {
    if (path) {
      path.remove();
      path = null;
    }
  };

  tool.onMouseMove = function (e) {
    paper.view._element.style.cursor = 'crosshair';
  };

  tool.onMouseDown = function (e) {
    topLeft = e.point;
    bottomRight = e.point;
  };

  tool.onMouseDrag = function (e) {
    if (path) path.remove();
    bottomRight = e.point; // Lock width and height if shift is held down

    if (e.modifiers.shift) {
      var d = bottomRight.subtract(topLeft);
      var max = Math.max(Math.abs(d.x), Math.abs(d.y));
      bottomRight.x = topLeft.x + max * (d.x < 0 ? -1 : 1);
      bottomRight.y = topLeft.y + max * (d.y < 0 ? -1 : 1);
    }

    var bounds = new paper.Rectangle(new paper.Point(topLeft.x, topLeft.y), new paper.Point(bottomRight.x, bottomRight.y));

    if (tool.cornerRadius !== 0) {
      path = new paper.Path.Rectangle(bounds, tool.cornerRadius);
    } else {
      path = new paper.Path.Rectangle(bounds);
    }

    path.fillColor = tool.fillColor;
    path.strokeColor = tool.strokeColor;
    path.strokeWidth = tool.strokeWidth;
    path.strokeCap = 'round';
  };

  tool.onMouseUp = function (e) {
    if (!path) return;
    path = null;
    paper.drawingTools.fireCanvasModified({
      layers: [paper.project.activeLayer]
    });
  };

  return tool;
};
/*
 * Copyright 2018 WICKLETS LLC
 *
 * This file is part of Paper.js-drawing-tools.
 *
 * Paper.js-drawing-tools is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Paper.js-drawing-tools is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Paper.js-drawing-tools.  If not, see <https://www.gnu.org/licenses/>.
 */
var TOOL_TEXT = () => {
  var CURSOR_TEXT = 'cursors/text.png';
  var tool = new paper.Tool();
  var hoveredOverText;
  var editingText;

  tool.onActivate = function (e) {};

  tool.onDeactivate = function (e) {
    if (editingText) {
      tool.finishEditingText();
    }

    hoveredOverText = null;
  };

  tool.onMouseMove = function (e) {
    paper.view._element.style.cursor = 'default';

    if (e.item && e.item.className === 'PointText' && !e.item.parent.parent) {
      hoveredOverText = e.item;
      paper.view._element.style.cursor = 'text';
    } else {
      hoveredOverText = null;
      paper.view._element.style.cursor = 'url(' + CURSOR_TEXT + ') 32 32, auto';
    }
  };

  tool.onMouseDown = function (e) {
    if (editingText) {
      tool.finishEditingText();
    } else if (hoveredOverText) {
      editingText = hoveredOverText;
      e.item.edit();
    } else {
      var text = new paper.PointText(e.point);
      text.justification = 'left';
      text.fillColor = 'black';
      text.content = 'This is some text';
      text.fontSize = 14;
      paper.drawingTools.fireCanvasModified({
        layers: [paper.project.activeLayer]
      });
    }
  };

  tool.onMouseDrag = function (e) {};

  tool.onMouseUp = function (e) {};

  tool.finishEditingText = function () {
    if (!editingText) return;
    editingText.finishEditing();
    editingText = null;
    paper.drawingTools.fireCanvasModified({
      layers: [paper.project.activeLayer]
    });
  };

  return tool;
};
/*
 * Copyright 2018 WICKLETS LLC
 *
 * This file is part of Paper.js-drawing-tools.
 *
 * Paper.js-drawing-tools is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Paper.js-drawing-tools is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Paper.js-drawing-tools.  If not, see <https://www.gnu.org/licenses/>.
 */
var TOOL_ZOOM = () => {
  var ZOOM_MIN = 0.1;
  var ZOOM_MAX = 20;
  var ZOOM_IN_AMOUNT = 1.25;
  var ZOOM_OUT_AMOUNT = 0.8;
  var zoomBox;
  var tool = new paper.Tool();

  tool.onActivate = function (e) {};

  tool.onDeactivate = function (e) {
    deleteZoomBox();
  };

  tool.onMouseMove = function (e) {
    paper.view._element.style.cursor = 'zoom-in';
  };

  tool.onMouseDown = function (e) {};

  tool.onMouseDrag = function (e) {
    deleteZoomBox();
    createZoomBox(e);
  };

  tool.onMouseUp = function (e) {
    if (zoomBox && zoomBoxIsValidSize()) {
      var bounds = zoomBox.bounds;
      paper.view.center = bounds.center;
      paper.view.zoom = paper.view.bounds.height / bounds.height;
    } else {
      var zoomAmount = e.modifiers.alt ? ZOOM_OUT_AMOUNT : ZOOM_IN_AMOUNT;
      paper.view.scale(zoomAmount, e.point);
    }

    deleteZoomBox();

    if (paper.view.zoom <= ZOOM_MIN) {
      paper.view.zoom = ZOOM_MIN;
    } else if (paper.view.zoom >= ZOOM_MAX) {
      paper.view.zoom = ZOOM_MAX;
    }

    paper.drawingTools.fireCanvasViewChanged({});
  };

  function createZoomBox(e) {
    var bounds = new paper.Rectangle(e.downPoint, e.point);
    bounds.x += 0.5;
    bounds.y += 0.5;
    zoomBox = new paper.Path.Rectangle(bounds);
    zoomBox.strokeColor = 'black';
    zoomBox.strokeWidth = 1.0 / paper.view.zoom;
  }

  function deleteZoomBox() {
    if (zoomBox) {
      zoomBox.remove();
      zoomBox = null;
    }
  }

  function zoomBoxIsValidSize() {
    return zoomBox.bounds.width > 5 && zoomBox.bounds.height > 5;
  }

  return tool;
};