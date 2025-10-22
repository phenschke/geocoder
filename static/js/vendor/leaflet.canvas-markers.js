/*!
 * Lightweight canvas marker layer for Leaflet.
 * Inspired by https://github.com/eJuke/Leaflet.Canvas-Markers
 * but trimmed down to cover the needs of the geocoder app.
 */
(function (factory, window) {
    if (typeof define === 'function' && define.amd) {
        define(['leaflet'], factory);
    } else if (typeof module !== 'undefined') {
        module.exports = factory(require('leaflet'));
    } else {
        factory(window.L);
    }
}(function (L) {
    if (!L) {
        throw new Error('Leaflet must be loaded before the canvas marker layer.');
    }

    L.CanvasIconLayer = L.Layer.extend({
        options: {
            padding: 0.2
        },

        initialize: function (options) {
            L.setOptions(this, options);
            this._markers = [];
            this._topLeft = null;
            this._ratio = window.devicePixelRatio || 1;
        },

        onAdd: function (map) {
            this._map = map;
            if (!this._canvas) {
                this._initCanvas();
            }

            map.getPanes().overlayPane.appendChild(this._canvas);
            map.on('moveend zoomend resize', this._reset, this);
            map.on('move', this._onMove, this);
            this._reset();
        },

        onRemove: function (map) {
            if (this._canvas && this._canvas.parentNode) {
                this._canvas.parentNode.removeChild(this._canvas);
            }

            map.off('moveend zoomend resize', this._reset, this);
            map.off('move', this._onMove, this);
            this._map = null;
        },

        addMarker: function (marker) {
            if (marker) {
                this._markers.push(marker);
                this._redraw();
            }
            return this;
        },

        addMarkers: function (markers) {
            if (Array.isArray(markers)) {
                for (let i = 0; i < markers.length; i++) {
                    const marker = markers[i];
                    if (marker) {
                        this._markers.push(marker);
                    }
                }
                this._redraw();
            }
            return this;
        },

        setMarkers: function (markers) {
            this._markers = Array.isArray(markers) ? markers.slice() : [];
            this._redraw();
            return this;
        },

        clearMarkers: function () {
            this._markers = [];
            this._redraw();
            return this;
        },

        redraw: function () {
            this._redraw();
            return this;
        },

        _initCanvas: function () {
            this._canvas = L.DomUtil.create('canvas', 'leaflet-canvas-icon-layer leaflet-layer');
            this._canvas.style.pointerEvents = 'none';
            this._canvas.style.position = 'absolute';
            this._ctx = this._canvas.getContext('2d', { willReadFrequently: false });
        },

        _reset: function () {
            if (!this._map) {
                return;
            }

            const size = this._map.getSize();
            const ratio = window.devicePixelRatio || 1;
            this._ratio = ratio;
            this._canvas.width = size.x * ratio;
            this._canvas.height = size.y * ratio;
            this._canvas.style.width = size.x + 'px';
            this._canvas.style.height = size.y + 'px';

            const ctx = this._ctx;
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
            ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

            this._updatePosition();
            this._redraw();
        },

        _onMove: function () {
            this._updatePosition();
            this._redraw();
        },

        _updatePosition: function () {
            if (!this._map || !this._canvas) {
                return;
            }

            const topLeft = this._map.containerPointToLayerPoint([0, 0]);
            this._topLeft = topLeft;

            if (L.DomUtil.setTransform) {
                L.DomUtil.setTransform(this._canvas, topLeft);
            } else {
                L.DomUtil.setPosition(this._canvas, topLeft);
            }
        },

        _redraw: function () {
            if (!this._map || !this._ctx) {
                return;
            }

            const ctx = this._ctx;
            const markers = this._markers;
            ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

            if (!markers.length) {
                return;
            }

            const bounds = this._map.getBounds().pad(this.options.padding || 0);
            const topLeft = this._topLeft || this._map.containerPointToLayerPoint([0, 0]);
            this._topLeft = topLeft;

            for (let i = 0; i < markers.length; i++) {
                const marker = markers[i];
                if (!marker || marker.lat == null || marker.lon == null) {
                    continue;
                }

                const latLng = L.latLng(marker.lat, marker.lon);
                if (!bounds.contains(latLng)) {
                    continue;
                }

                const layerPoint = this._map.latLngToLayerPoint(latLng);
                const x = layerPoint.x - topLeft.x;
                const y = layerPoint.y - topLeft.y;

                const size = marker.size || 12;
                const radius = size / 2;
                const stroke = marker.strokeStyle !== undefined ? marker.strokeStyle : '#ffffff';
                const lineWidth = marker.lineWidth !== undefined ? marker.lineWidth : 2;

                ctx.save();

                ctx.globalAlpha = marker.opacity != null ? marker.opacity : 1;
                ctx.fillStyle = marker.fillStyle || marker.color || '#3498db';

                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2, false);
                ctx.fill();

                if (lineWidth > 0) {
                    ctx.lineWidth = lineWidth;
                    ctx.strokeStyle = stroke;
                    ctx.stroke();
                }

                if (marker.label) {
                    ctx.fillStyle = marker.textColor || '#ffffff';
                    const fontSize = marker.fontSize || Math.max(9, Math.round(size * 0.5));
                    const fontWeight = marker.fontWeight || '600';
                    const fontFamily = marker.font || 'Inter, system-ui, sans-serif';

                    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(marker.label, x, y);
                }

                if (marker.highlight) {
                    ctx.strokeStyle = marker.highlightColor || '#2ecc71';
                    ctx.lineWidth = (marker.highlightWidth || 3);
                    ctx.globalAlpha = 0.85;
                    ctx.beginPath();
                    ctx.arc(x, y, radius + ctx.lineWidth, 0, Math.PI * 2, false);
                    ctx.stroke();
                }

                ctx.restore();
            }
        }
    });

    L.canvasIconLayer = function (options) {
        return new L.CanvasIconLayer(options);
    };

    return L.CanvasIconLayer;
}, window));
