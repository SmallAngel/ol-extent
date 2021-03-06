import ol from 'openlayers'
import StyleFactory from '../style/StyleFactory'
import { createVectorLayer } from '../layer/layerUtils'
import {uuid} from '../utils'
import '../assets/scss/measureTool.scss'

class MeasureTool extends ol.interaction.Pointer {
  /**
   * 处理移动事件
   * @param mapBrowserEvent
   */
  static handleMoveEvent_ = function (mapBrowserEvent) {
    if (this.getTool()) {
      if (this.drawStart_ && !mapBrowserEvent.dragging &&
        this.measureType === this.measureTypes.measureCircle['name']) {
        this.afterDrawPointClickHandler(mapBrowserEvent)
      } else if (!this.drawStart_ && !mapBrowserEvent.dragging) {
        this.beforeDrawPointClickHandler(mapBrowserEvent)
      } else if (this.drawStart_ && !mapBrowserEvent.dragging) {
        this.afterDrawPointClickHandler(mapBrowserEvent)
      } else if (this.freehand && this.drawStart_ && mapBrowserEvent.dragging) {
        this.afterDragHandler_(mapBrowserEvent)
      }
    }
  };

  /**
   * 鼠标按下事件
   * @param mapBrowserEvent
   * @private
   */
  static handleDownEvent_ = function (mapBrowserEvent) {
    if (this.freehand) {
      console.log(mapBrowserEvent)
    }
  };

  /**
   * 处理拖拽事件
   * @param mapBrowserEvent
   * @private
   */
  static handleDragEvent_ = function (mapBrowserEvent) {
    if (this.freehand) {
      console.log(mapBrowserEvent)
    }
  };

  constructor (options = {}) {
    super({
      handleMoveEvent: MeasureTool.handleMoveEvent_,
      handleDownEvent: MeasureTool.handleDownEvent_,
      handleDragEvent: MeasureTool.handleDragEvent_
    });

    /**
     * options
     * @type {{}}
     */
    this.options = options;

    /**
     * 计算工具
     * @type {ol.Sphere}
     */
    this.wgs84Sphere = new ol.Sphere(typeof options['sphere'] === 'number' ? options['sphere'] : 6378137)

    /**
     * 测量类型（目前预制两种，测距和测面）
     * @type {{measureLength: string, measureArea: string}}
     */
    this.measureTypes = {
      measureLength: {
        name: 'measureLength',
        type: 'LineString'
      },
      measureArea: {
        name: 'measureArea',
        type: 'Polygon'
      },
      measureCircle: {
        name: 'measureCircle',
        type: 'Circle'
      }
    };

    /**
     * 当前测量类型
     * @type {string}
     */
    this.measureType = '';

    /**
     * 自由画笔
     * @type {boolean}
     */
    this.freehand = false;

    /**
     * 是否使用地理测量方式
     * @type {boolean}
     */
    this.isGeodesic = (options['isGeodesic'] === false ? options['isGeodesic'] : true);

    /**
     * 测量工具所处图层
     * @type {*}
     */
    this.layerName = options['layerName'] || 'measureTool';

    /**
     * 当前矢量图层
     * @type {null}
     */
    this.layer = null;

    /**
     * 交互工具
     * @type {null}
     */
    this.draw = null;

    /**
     * 工具是否激活
     * @type {boolean}
     */
    this.isActive_ = false;

    /**
     * 点击计数器
     * @type {string}
     */
    this.clickCount = '';

    /**
     * drawStyle
     * @type {{}}
     */
    this.drawStyle = {
      fill: {
        fillColor: 'rgba(67, 110, 238, 0.4)'
      },
      stroke: {
        strokeColor: 'rgba(249, 185, 154, 1)',
        strokeWidth: 2.5
      },
      image: {
        type: '',
        image: {
          fill: {
            fillColor: 'rgba(255, 255, 255, 0.8)'
          },
          points: Infinity,
          radius: 4,
          stroke: {
            strokeColor: 'rgba(255, 0, 0, 1)',
            strokeWidth: 1.5
          }
        }
      }
    }
    if (options['drawStyle'] && typeof options['drawStyle'] === 'object') {
      this.drawStyle = options['drawStyle']
    }

    /**
     * 完成后样式
     * @type {{}}
     */
    this.finshStyle = {
      fill: {
        fillColor: 'rgba(67, 110, 238, 0.4)'
      },
      stroke: {
        strokeColor: 'rgba(253, 128, 68, 1)',
        strokeWidth: 3
      },
      image: {
        type: '',
        image: {
          fill: {
            fillColor: 'rgba(255, 255, 255, 0.8)'
          },
          points: Infinity,
          radius: 4,
          stroke: {
            strokeColor: 'rgba(255, 0, 0, 1)',
            strokeWidth: 1.5
          }
        }
      }
    };
    if (options['finshStyle'] && typeof options['finshStyle'] === 'object') {
      this.finshStyle = options['finshStyle'];
    }

    /**
     * @type {string|undefined}
     * @private
     */
    this.cursor_ = 'default';

    /**
     * @type {string|undefined}
     * @private
     */
    this.previousCursor_ = undefined;

    /**
     * 双击放大交互
     * @type {*}
     */
    this.doubleClickZoom = null;
  }

  /**
   * addDrawInteractions
   * @param type
   */
  addDrawInteractions_ (type) {
    let style_ = StyleFactory.getStyle(this.drawStyle);
    this.draw = new ol.interaction.Draw({
      type: type,
      style: style_,
      freehand: this.freehand
    });
    this.draw.set('uuid', uuid());
    this.getMap().addInteraction(this.draw);
    this.draw.on('drawstart', this.drawStartHandle_, this);
    this.draw.on('drawend', this.drawEndHandle_, this);
    if (type === 'LineString' && !this.freehand) {
      this.getMap().on('singleclick', this.drawClickHandle_, this);
    }
  }

  /**
   * 单击事件处理
   * @param event
   * @private
   */
  drawClickHandle_ (event) {
    if (this.drawStart_ && !event.dragging) {
      if (!this.clickCount) {
        this.clickCount = uuid();
        this.draw.set('measureResult', '起点');
      }
      this.addMeasurecircle(event.coordinate);
      this.addMeasureOverlay(event.coordinate, this.draw.get('measureResult'));
    }
  }

  /**
   * 添加点击测量时的圆圈
   * @param coordinate
   */
  addMeasurecircle (coordinate) {
    const feature = new ol.Feature({
      uuid: this.draw.get('uuid'),
      geometry: new ol.geom.Point(coordinate)
    });
    this.layer.getSource().addFeature(feature);
  }

  /**
   * drawStartHandle
   * @param event
   * @private
   */
  drawStartHandle_ (event) {
    let that = this;
    this.drawStart_ = true;
    event.feature.getGeometry().on('change', evt => {
      let geom = evt.target;
      if (geom instanceof ol.geom.LineString) {
        let output = that.formatData(geom);
        that.draw.set('measureResult', output);
      } else if (geom instanceof ol.geom.Polygon) {
        let area = this.formatData(geom);
        that.draw.set('measureResult', area);
      } else if (geom instanceof ol.geom.Circle) {
        let area = this.formatData(geom);
        that.draw.set('measureResult', area);
      }
    })
  }

  /**
   * drawEndHandle
   * @param event
   * @private
   */
  drawEndHandle_ (event) {
    this.drawEnd_ = true;
    let feature = event.feature;
    feature.set('uuid', this.draw.get('uuid'));
    this.layer.getSource().addFeature(feature);
    let coordinates = feature.getGeometry().getLastCoordinate();
    if (this.measureTypes.measureLength['name'] === this.measureType) {
      this.addMeasurecircle(coordinates);
      this.addMeasureOverlay(coordinates, this.draw.get('measureResult'), 'length');
    } else if (this.measureTypes.measureArea['name'] === this.measureType) {
      let center = ol.extent.getCenter(feature.getGeometry().getExtent());
      this.addMeasureOverlay(center, this.draw.get('measureResult'), 'area');
    } else if (this.measureTypes.measureCircle['name'] === this.measureType) {
      let center = ol.extent.getCenter(feature.getGeometry().getExtent());
      this.addMeasureOverlay(center, this.draw.get('measureResult'), 'circle');
    }
    this.addMeasureRemoveButton(coordinates);
    this.setTool(false);
    this.dispatchEvent('measureEnd');
  }

  /**
   * 点击之前的帮助信息
   * @param event
   */
  beforeDrawPointClickHandler (event) {
    if (!this.measureHelpTooltip && this.getTool()) {
      let helpTooltipElement = document.createElement('span');
      if (this.measureTypes.measureLength['name'] === this.measureType) {
        helpTooltipElement.className = 'ole-measure-tool ole-measure-tool-length';
        if (this.freehand) {
          helpTooltipElement.innerHTML = '按下鼠标拖拽开始测量';
        } else {
          helpTooltipElement.innerHTML = '单击开始测距';
        }
      } else if (this.measureTypes.measureArea['name'] === this.measureType) {
        helpTooltipElement.className = 'ole-measure-tool ole-measure-tool-area';
        if (this.freehand) {
          helpTooltipElement.innerHTML = '按下鼠标拖拽开始测量';
        } else {
          helpTooltipElement.innerHTML = '单击开始测面';
        }
      } else if (this.measureTypes.measureCircle['name'] === this.measureType) {
        helpTooltipElement.className = 'ole-measure-tool ole-measure-tool-area';
        if (this.freehand) {
          helpTooltipElement.innerHTML = '按下鼠标拖拽开始测量';
        } else {
          helpTooltipElement.innerHTML = '单击开始测方圆面积';
        }
      }
      this.measureHelpTooltip = new ol.Overlay({
        element: helpTooltipElement,
        offset: [15, 0],
        positioning: 'center-left'
      });
      this.measureHelpTooltip.set('layerName', this.layerName);
      this.getMap().addOverlay(this.measureHelpTooltip);
    } else if (this.measureHelpTooltip && this.measureHelpTooltip instanceof ol.Overlay) {
      this.measureHelpTooltip.setPosition(event.coordinate);
    }
  }

  /**
   * 点击一次后的提示信息
   * @param event
   */
  afterDrawPointClickHandler (event) {
    let helpTooltipElement = this.measureHelpTooltip.getElement();
    if (this.measureTypes.measureLength['name'] === this.measureType) {
      helpTooltipElement.className = 'ole-measure-tool-move ole-measure-tool-length';
      let length = this.draw.get('measureResult');
      helpTooltipElement.innerHTML = '<span>总长：' +
        '<span class="measure-result">' + length + '</span>' +
        '</span><br>' +
        '<span class="tool-tip">单击确定地点，双击结束</span>';
    } else if (this.measureTypes.measureArea['name'] === this.measureType) {
      helpTooltipElement.className = 'ole-measure-tool-move ole-measure-tool-area';
      let area = this.draw.get('measureResult');
      helpTooltipElement.innerHTML = '<span>总面积：' +
        '<span class="measure-result">' + area + '</span>' +
        '</span><br>' +
        '<span class="tool-tip">单击确定地点，双击结束</span>';
    } else if (this.measureTypes.measureCircle['name'] === this.measureType) {
      helpTooltipElement.className = 'ole-measure-tool-move ole-measure-tool-area';
      let area = this.draw.get('measureResult');
      helpTooltipElement.innerHTML = '<span>总面积：' +
        '<span class="measure-result">' + area + '</span>' +
        '</span><br>' +
        '<span class="tool-tip">单击确定地点，双击结束</span>';
    }
    this.measureHelpTooltip.setPosition(event.coordinate);
    this.getMap().render();
  }

  /**
   * 自由测量时拖拽事件
   * @param event
   * @private
   */
  afterDragHandler_ (event) {
    let helpTooltipElement = this.measureHelpTooltip.getElement();
    if (this.measureTypes.measureLength['name'] === this.measureType) {
      helpTooltipElement.className = 'ole-measure-tool-move ole-measure-tool-length';
      let length = this.draw.get('measureResult');
      helpTooltipElement.innerHTML = '<span>总长：' +
        '<span class="measure-result">' + length + '</span>' +
        '</span><br>' +
        '<span class="tool-tip">松开鼠标按键结束测量</span>';
    } else if (this.measureTypes.measureArea['name'] === this.measureType) {
      helpTooltipElement.className = 'ole-measure-tool-move ole-measure-tool-area';
      let area = this.draw.get('measureResult');
      helpTooltipElement.innerHTML = '<span>总面积：' +
        '<span class="measure-result">' + area + '</span>' +
        '</span><br>' +
        '<span class="tool-tip">松开鼠标按键结束测量</span>';
    } else if (this.measureTypes.measureCircle['name'] === this.measureType) {
      helpTooltipElement.className = 'ole-measure-tool-move ole-measure-tool-area';
      let area = this.draw.get('measureResult');
      helpTooltipElement.innerHTML = '<span>总面积：' +
        '<span class="measure-result">' + area + '</span>' +
        '</span><br>' +
        '<span class="tool-tip">松开鼠标按键结束测量</span>';
    }
    this.measureHelpTooltip.setPosition(event.coordinate);
    this.getMap().render();
  }

  /**
   * 添加测量结果overlay
   * @param coordinate
   * @param length
   * @param type
   */
  addMeasureOverlay (coordinate, length, type) {
    let measureResult = document.createElement('span');
    let measureOverlay = null;
    if (type === 'length') {
      measureResult.className = 'ole-measure-tool-end-overlay-label';
      measureResult.innerHTML = "总长：<span class='measure-end-label'>" + length + '</span>'
      measureOverlay = new ol.Overlay({
        element: measureResult,
        position: coordinate,
        offset: [10, 10],
        positioning: 'top-left'
      });
    } else if (type === 'area') {
      measureResult.className = 'ole-measure-tool-area-overlay-label';
      measureResult.innerHTML = '<span class="measure-label">' + length + '</span>';
      measureOverlay = new ol.Overlay({
        element: measureResult,
        position: coordinate,
        positioning: 'center-center'
      });
    } else if (type === 'circle') {
      measureResult.className = 'ole-measure-tool-area-overlay-label';
      measureResult.innerHTML = '<span class="measure-label">' + length + '</span>';
      measureOverlay = new ol.Overlay({
        element: measureResult,
        position: coordinate,
        positioning: 'center-center'
      });
    } else {
      measureResult.className = 'ole-measure-tool-overlay-label';
      measureResult.innerHTML = length;
      measureOverlay = new ol.Overlay({
        element: measureResult,
        position: coordinate,
        offset: [10, 0],
        positioning: 'center-left'
      });
    }
    measureOverlay.set('layerName', this.layerName);
    measureOverlay.set('uuid', this.draw.get('uuid'));
    this.getMap().addOverlay(measureOverlay);
    this.getMap().render();
  }

  /**
   * 添加单例清除按钮
   * @param coordinate
   */
  addMeasureRemoveButton (coordinate) {
    let that = this;
    let imageButton = document.createElement('img');
    imageButton.src = (this.options['removeButtonSrc'] ? this.options['removeButtonSrc'] : 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyJpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuMy1jMDExIDY2LjE0NTY2MSwgMjAxMi8wMi8wNi0xNDo1NjoyNyAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENTNiAoV2luZG93cykiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6NEYzMzc1RDY3RDU1MTFFNUFDNDJFNjQ4NUUwMzRDRDYiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6NEYzMzc1RDc3RDU1MTFFNUFDNDJFNjQ4NUUwMzRDRDYiPiA8eG1wTU06RGVyaXZlZEZyb20gc3RSZWY6aW5zdGFuY2VJRD0ieG1wLmlpZDo0RjMzNzVENDdENTUxMUU1QUM0MkU2NDg1RTAzNENENiIgc3RSZWY6ZG9jdW1lbnRJRD0ieG1wLmRpZDo0RjMzNzVENTdENTUxMUU1QUM0MkU2NDg1RTAzNENENiIvPiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI/PsDx84AAAAC3SURBVHjavJIxDoMwDEV/ok5wDCbu0DvAdUBIwMLFSs/AxDXY6tZ2SCGVUikd+ifn20+2k5hHVd0AXJGmGQw+UyWMxY8KQGpbUNcB23aYHIsnuSgIy8dlAQ2DgwWSmD0YE5ReAq5pQOMIrKsDRByjKGC/dsxz2L7XQgU8JB7n4qDoY6SYF4J+p72T7/zeOXqr03SMx8XnsTUX7UgElKVCyDK3s8Tsae6sv/8ceceZ6jr1k99fAgwAsZy0Sa2HgDcAAAAASUVORK5CYII=')
    imageButton.style.cursor = 'pointer';
    imageButton.title = '清除测量结果';
    imageButton.uuid_ = this.draw.get('uuid');
    imageButton.onclick = function (event) {
      that.removeMeasure_(this.uuid_);
    };
    let closeBtn = new ol.Overlay({
      element: imageButton,
      offset: [8, 0],
      position: coordinate,
      positioning: 'center-left'
    });
    closeBtn.set('uuid', this.draw.get('uuid'));
    closeBtn.set('layerName', this.layerName);
    this.getMap().addOverlay(closeBtn);
    this.getMap().render();
  }

  /**
   * 移除测量结果
   * @param uuid
   * @private
   */
  removeMeasure_ (uuid) {
    let overlays = this.getMap().getOverlays().getArray();
    if (overlays && Array.isArray(overlays)) {
      let length = overlays.length;
      // TODO 注意地图移除Overlay时数组长度会变化
      for (let j = 0, i = 0; j < length; j++) {
        i++;
        if (overlays[length - i] && overlays[length - i] instanceof ol.Overlay && overlays[length - i].get('uuid') === uuid) {
          this.getMap().removeOverlay(overlays[length - i])
        }
      }
    }
    if (this.layer && this.layer.getSource()) {
      let source = this.layer.getSource();
      let features = source.getFeatures();
      features.forEach(function (feat) {
        if (feat.get('uuid') === uuid) {
          source.removeFeature(feat)
        }
      }, this)
    }
  }

  /**
   * 激活测量工具
   * @param active
   * @param key
   * @param freehand
   */
  setTool (active, key, freehand) {
    this.removeLastInteraction_();
    if (active && key && this.measureTypes.hasOwnProperty(key)) {
      this.isActive_ = active;
      this.freehand = freehand;
      this.measureType = key;
      if (!this.layer) {
        let _style = StyleFactory.getStyle(this.finshStyle);
        this.layer = createVectorLayer(this.getMap(), this.layerName, {
          create: true
        });
        this.layer.setStyle(_style);
      }
      this.addDrawInteractions_(this.measureTypes[key]['type']);
    }
  }

  /**
   * 移除上一次激活的工具
   * @private
   */
  removeLastInteraction_ () {
    this.isActive_ = false;
    this.freehand = false;
    this.drawStart_ = false;
    if (this.draw) {
      this.draw.un('drawstart', this.drawStartHandle_, this);
      this.draw.un('drawend', this.drawEndHandle_, this);
      this.getMap().un('singleclick', this.drawClickHandle_, this);
      if (this.measureHelpTooltip && this.measureHelpTooltip instanceof ol.Overlay) {
        this.getMap().removeOverlay(this.measureHelpTooltip);
        this.measureHelpTooltip = null
      }
      this.clickCount = '';
      this.disActionInteraction();
      this.getMap().removeInteraction(this.draw);
      this.measureType = ''
    }
  }

  /**
   * getTool
   * @returns {boolean|*}
   */
  getTool () {
    return this.isActive_;
  }

  setActive (active) {
    super.setActive.call(this, active);
  }

  /**
   * 禁止交互
   */
  disActionInteraction () {
    this.doubleClickZoom = this.getDoubleClickZoomInteraction();
    let active = this.doubleClickZoom.getActive();
    this.doubleClickZoom.setActive(false);
    window.setTimeout(() => {
      this.doubleClickZoom.setActive(active);
    }, 200);
  }

  /**
   * 获取双击放大交互
   * @returns {ol.interaction.DoubleClickZoom|*}
   */
  getDoubleClickZoomInteraction () {
    if (!this.doubleClickZoom) {
      let items = this.getMap().getInteractions().getArray();
      items.every(item => {
        if (item && item instanceof ol.interaction.DoubleClickZoom) {
          this.doubleClickZoom = item;
          return false;
        } else {
          return true;
        }
      })
    }
    return this.doubleClickZoom;
  }

  /**
   * 测量结果格式化
   * @param geom
   * @returns {number}
   */
  formatData (geom) {
    let output = 0;
    if (geom) {
      if (this.measureTypes.measureLength['name'] === this.measureType) {
        if (this.isGeodesic) {
          let [coordinates, length] = [geom.getCoordinates(), 0];
          let sourceProj = this.getMap().getView().getProjection();
          for (let i = 0, ii = coordinates.length - 1; i < ii; ++i) {
            let c1 = ol.proj.transform(coordinates[i], sourceProj, 'EPSG:4326');
            let c2 = ol.proj.transform(coordinates[i + 1], sourceProj, 'EPSG:4326');
            length += this.wgs84Sphere.haversineDistance(c1, c2);
          }
          if (length > 100) {
            output = (Math.round(length / 1000 * 100) / 100) + ' ' + '公里';
          } else {
            output = (Math.round(length * 100) / 100) + ' ' + '米';
          }
        } else {
          output = Math.round(geom.getLength() * 100) / 100;
        }
      } else if (this.measureType === 'measureArea') {
        if (this.isGeodesic) {
          let sourceProj = this.getMap().getView().getProjection();
          let geometry = /** @type {ol.geom.Polygon} */(geom.clone().transform(
            sourceProj, 'EPSG:4326'))
          let coordinates = geometry.getLinearRing(0).getCoordinates();
          let area = Math.abs(this.wgs84Sphere.geodesicArea(coordinates));
          if (area > 10000000000) {
            output = (Math.round(area / (1000 * 1000 * 10000) * 100) / 100) + ' ' + '万平方公里'
          } else if (area > 1000000 && area < 10000000000) {
            output = (Math.round(area / (1000 * 1000) * 100) / 100) + ' ' + '平方公里'
          } else {
            output = (Math.round(area * 100) / 100) + ' ' + '平方米'
          }
        } else {
          output = geom.getArea()
        }
      } else if (this.measureType === 'measureCircle') {
        let sourceProj = this.getMap().getView().getProjection();
        let circle = /** @type {ol.geom.Polygon} */(geom.clone().transform(
          sourceProj, 'EPSG:4326'))
        let polygon = ol.geom.Polygon.fromCircle(circle, 64, 0);
        if (this.isGeodesic) {
          let coordinates = polygon.getLinearRing(0).getCoordinates();
          let area = Math.abs(this.wgs84Sphere.geodesicArea(coordinates));
          if (area > 10000000000) {
            output = (Math.round(area / (1000 * 1000 * 10000) * 100) / 100) + ' ' + '万平方公里'
          } else if (area > 1000000 && area < 10000000000) {
            output = (Math.round(area / (1000 * 1000) * 100) / 100) + ' ' + '平方公里'
          } else {
            output = (Math.round(area * 100) / 100) + ' ' + '平方米'
          }
        } else {
          output = polygon.getArea();
        }
      }
    }
    return output;
  }
}

export default MeasureTool
