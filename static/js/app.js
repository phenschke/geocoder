// Historical Map Geocoder - Leaflet-based Version
class GeocoderApp {
    constructor() {
        this.map = null;
        this.baseLayers = {};
        this.overlayLayers = {};
        this.currentBaseLayer = null;
        this.currentHistoricalMap = null; // Track currently active historical overlay map name
        this.historicalOverlays = {};
        this.overlayBounds = null;
        this.canvasMarkerLayers = {}; // Dictionary of marker layers keyed by map_name
        this.markerLayersByMapName = {}; // Points grouped by map_name
        this.activeMarker = null;
        this.selectedMarkerId = null; // Track which marker is selected for dragging
        this.currentAddress = null;
        this.geocodedPoints = []; // All points (for compatibility)
        this.streetColorMap = null; // Cache for spatially-aware street color assignments
        this.layerControl = null;
        this.opacityControl = null;
        this.opacityControlAdded = false; // Track if opacity control is on map

        // Munich coordinates (default center)
        this.munichCenter = [48.1351, 11.5820];
        this.defaultZoom = 13;

        // Address list state
        this.addressList = {
            currentPage: 1,
            perPage: 50,
            sortBy: 'street',
            sortOrder: 'ASC',
            filterStatus: '',
            filterStreet: '',
            searchQuery: '',
            totalPages: 1,
            total: 0
        };
        this.autoAdvanceEnabled = true;
        this.addressListExpanded = false;
        this.currentPageAddresses = []; // Track addresses in current view

        // CSV import state
        this.csvData = null;
        this.csvColumns = [];
        this.csvRows = [];

        // Marker rendering configuration
        this.markerFetchLimit = null; // Fetch entire set in one request
        this.pointsRequestToken = 0;
        this.pointsReloadTimer = null;
        this.markerHitTolerance = 18;
        this.markerInfoPopup = null;
        this.draggingMarker = null;
        this.isCanvasMarkerDragging = false;
        this.markerDragZoomBuffer = 2; // Allow dragging when within 2 zoom levels of max
        this.skipNextMapClick = false;
        this.pendingMarkerDrag = null;
        this.handleMarkerDragMove = this.onMarkerDragMove.bind(this);
        this.handleMarkerDragEnd = this.onMarkerDragEnd.bind(this);
        this.handlePendingDragMove = this.onPendingMarkerDragMove.bind(this);
        this.handlePendingDragUp = this.onPendingMarkerDragUp.bind(this);
        this.isSidebarResizing = false;
        this.sidebarResizeStartX = 0;
        this.sidebarResizeStartWidth = 0;
        this.sidebarMinWidth = 260;
        this.sidebarMaxWidth = 640;
        this.sidebarWidthStorageKey = 'geocoder.sidebarWidth';
        this.isProcessingAction = false; // Prevent concurrent geocode/skip operations

        this.init();
    }

    init() {
        this.initMap();
        this.initLayoutResizer();
        this.setupEventListeners();
        this.loadAvailableMaps();
        this.loadCurrentAddress();
        this.updateProgress();
        this.loadStreets();
        this.loadAddressList();
        this.scheduleLoadGeocodedPoints(0); // Load and display initial geocoded markers
    }

    initMap() {
        // Create map centered on Munich with performance optimizations
        this.map = L.map('map', {
            center: this.munichCenter,
            zoom: this.defaultZoom,
            zoomControl: true,
            preferCanvas: true, // Use Canvas renderer for better performance with many markers
            zoomAnimation: true,
            fadeAnimation: true,
            markerZoomAnimation: true
        });

        // Define base layers with performance optimizations
        this.baseLayers = {
            'OpenStreetMap': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19,
                updateWhenIdle: true,
                keepBuffer: 4
            }),
            'Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: '© Esri',
                maxZoom: 19,
                updateWhenIdle: true,
                keepBuffer: 4
            })
        };

        // Add default base layer (OSM)
        this.baseLayers['OpenStreetMap'].addTo(this.map);

        // Create "No overlay" dummy layer for deselecting all historical maps
        this.noOverlayLayer = L.layerGroup();
        this.noOverlayLayer.addTo(this.map);

        // Initialize grouped layer control (marker layers will be added dynamically)
        const groupedOverlays = {
            'Historical Maps': {
                'No overlay': this.noOverlayLayer
            },
            'Geocoded Markers': {
                // Marker layers will be added dynamically as data is loaded
            }
        };

        this.layerControl = L.control.groupedLayers(this.baseLayers, groupedOverlays, {
            position: 'topright',
            collapsed: false,
            exclusiveGroups: ['Historical Maps'] // Radio buttons for historical maps
        }).addTo(this.map);

        // Create custom opacity control
        this.createOpacityControl();

        // Add coordinate display on mouse move
        this.map.on('mousemove', (e) => {
            document.getElementById('coordsDisplay').textContent =
                `Lat: ${e.latlng.lat.toFixed(6)}, Lon: ${e.latlng.lng.toFixed(6)}`;
        });

        // Handle right-click for geocoding
        this.map.on('contextmenu', (e) => this.onMapRightClick(e));
        this.map.on('click', (e) => this.onMapClick(e));
        this.map.on('mousedown', (e) => this.onMapMouseDown(e));
        this.map.on('mousemove', (e) => this.onMapMouseMove(e));
        this.map.on('mouseout', () => {
            if (this.map) {
                this.map.getContainer().classList.remove('geocoder-map--marker-hover');
            }
        });

        // Listen for overlay add/remove events to show/hide opacity control
        this.map.on('overlayadd', (e) => this.onOverlayAdd(e));
        this.map.on('overlayremove', (e) => this.onOverlayRemove(e));

        // Update marker sizes when zoom changes
        this.map.on('zoomend', () => {
            this.updateMarkerSizes();
            this.syncMarkerDragState();
        });

        this.syncMarkerDragState();
    }

    initLayoutResizer() {
        const resizer = document.getElementById('sidebarResizer');
        const sidebar = document.querySelector('.sidebar');
        const container = document.querySelector('.container');
        if (!resizer || !sidebar || !container) {
            return;
        }

        const mapInvalidate = () => {
            if (this.map) {
                this.map.invalidateSize({ animate: false });
            }
        };

        const applySidebarWidth = (rawWidth) => {
            const clampedWidth = Math.max(this.sidebarMinWidth, Math.min(this.sidebarMaxWidth, rawWidth));
            sidebar.style.width = `${clampedWidth}px`;
            sidebar.style.flexBasis = `${clampedWidth}px`;
            return clampedWidth;
        };

        // Initialize from stored width if available
        try {
            const stored = window.localStorage ? window.localStorage.getItem(this.sidebarWidthStorageKey) : null;
            if (stored) {
                const parsed = parseInt(stored, 10);
                if (!Number.isNaN(parsed)) {
                    this.currentSidebarWidth = applySidebarWidth(parsed);
                }
            }
        } catch (err) {
            console.warn('Sidebar width restore failed:', err);
        }

        if (!this.currentSidebarWidth) {
            this.currentSidebarWidth = sidebar.getBoundingClientRect().width;
        }

        const handleMouseMove = (event) => {
            if (!this.isSidebarResizing) return;

            const delta = event.clientX - this.sidebarResizeStartX;
            const newWidth = applySidebarWidth(this.sidebarResizeStartWidth + delta);
            this.currentSidebarWidth = newWidth;
            mapInvalidate();
        };

        const handleMouseUp = () => {
            if (!this.isSidebarResizing) return;

            this.isSidebarResizing = false;
            document.body.classList.remove('resizing-sidebar');
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);

            if (this.currentSidebarWidth) {
                try {
                    if (window.localStorage) {
                        window.localStorage.setItem(this.sidebarWidthStorageKey, String(this.currentSidebarWidth));
                    }
                } catch (err) {
                    console.warn('Sidebar width save failed:', err);
                }
            }

            mapInvalidate();
        };

        resizer.addEventListener('mousedown', (event) => {
            if (event.button !== 0) return; // left button only
            this.isSidebarResizing = true;
            this.sidebarResizeStartX = event.clientX;
            this.sidebarResizeStartWidth = sidebar.getBoundingClientRect().width;
            this.currentSidebarWidth = this.sidebarResizeStartWidth;

            document.body.classList.add('resizing-sidebar');
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);

            event.preventDefault();
        });

        const handleWindowResize = () => {
            const width = sidebar.getBoundingClientRect().width;
            this.currentSidebarWidth = applySidebarWidth(width);
            mapInvalidate();
        };

        window.addEventListener('resize', handleWindowResize);
    }

    createOpacityControl() {
        // Create custom Leaflet control for opacity slider
        const OpacityControl = L.Control.extend({
            options: {
                position: 'topright'
            },

            onAdd: function(map) {
                const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-opacity');
                container.innerHTML = `
                    <div class="opacity-control-content">
                        <label>Overlay Opacity: <span id="opacityValue">100%</span></label>
                        <input type="range" id="opacitySlider" min="0" max="100" value="100" class="opacity-slider">
                    </div>
                `;

                // Prevent click propagation to map
                L.DomEvent.disableClickPropagation(container);
                L.DomEvent.disableScrollPropagation(container);

                return container;
            }
        });

        this.opacityControl = new OpacityControl();
        // Don't add it yet - we'll add it when an overlay is active
    }

    onOverlayAdd(e) {
        // If "No overlay" was selected, remove all historical overlays
        if (e.layer === this.noOverlayLayer) {
            for (let name in this.overlayLayers) {
                if (this.map.hasLayer(this.overlayLayers[name])) {
                    this.map.removeLayer(this.overlayLayers[name]);
                }
            }
            this.currentHistoricalMap = null; // Clear current map
            this.loadAddressList(); // Reload address list with deduplicated view
            return;
        }

        // If a real historical map was selected, remove "No overlay" dummy layer
        if (this.overlayLayers[e.name]) {
            if (this.map.hasLayer(this.noOverlayLayer)) {
                this.map.removeLayer(this.noOverlayLayer);
            }
            // Track the currently active historical map
            this.currentHistoricalMap = e.name;
            this.loadAddressList(); // Reload address list filtered for this map
        }

        // Show opacity control when any real overlay is added
        if (e.layer !== this.noOverlayLayer && !this.opacityControlAdded) {
            this.opacityControl.addTo(this.map);
            this.opacityControlAdded = true;

            // Setup slider event after control is added to DOM
            setTimeout(() => {
                const slider = document.getElementById('opacitySlider');
                if (slider) {
                    slider.addEventListener('input', (event) => this.updateAllOverlaysOpacity(event));
                }
            }, 0);
        }
    }

    onOverlayRemove(e) {
        // If a real historical map was removed, check if we should activate "No overlay"
        if (e.layer !== this.noOverlayLayer && this.overlayLayers[e.name]) {
            // Clear current map if this overlay was the active one
            if (this.currentHistoricalMap === e.name) {
                this.currentHistoricalMap = null;
                this.loadAddressList(); // Reload with deduplicated view
            }

            // Check if any historical overlays are still active
            let hasActiveOverlay = false;
            for (let name in this.overlayLayers) {
                if (this.map.hasLayer(this.overlayLayers[name])) {
                    hasActiveOverlay = true;
                    break;
                }
            }

            // If no historical overlays are active, add "No overlay" back
            if (!hasActiveOverlay && !this.map.hasLayer(this.noOverlayLayer)) {
                this.noOverlayLayer.addTo(this.map);
            }

            // Remove opacity control if no overlays are active
            if (!hasActiveOverlay && this.opacityControlAdded) {
                this.map.removeControl(this.opacityControl);
                this.opacityControlAdded = false;
            }
        }

        this.syncMarkerDragState();
    }

    updateAllOverlaysOpacity(e) {
        const opacity = e.target.value / 100;
        document.getElementById('opacityValue').textContent = e.target.value + '%';

        // Update opacity for all active overlays
        for (let name in this.overlayLayers) {
            if (this.map.hasLayer(this.overlayLayers[name])) {
                this.overlayLayers[name].setOpacity(opacity);
            }
        }
    }

    setupEventListeners() {
        // CSV file selection (handles both new imports and backup restores)
        document.getElementById('csvFile').addEventListener('change', (e) => this.onFileSelected(e));

        // Modal controls
        document.getElementById('modalClose').addEventListener('click', () => this.closeModal());
        document.getElementById('modalCancel').addEventListener('click', () => this.closeModal());
        document.getElementById('modalImport').addEventListener('click', () => this.confirmImport());
        document.getElementById('csvModal').addEventListener('click', (e) => {
            if (e.target.id === 'csvModal') this.closeModal();
        });

        // Column selection change handlers
        document.getElementById('modalStreetCol').addEventListener('change', () => this.updatePreviewHighlight());
        document.getElementById('modalNumberCol').addEventListener('change', () => this.updatePreviewHighlight());
        document.getElementById('modalLatCol').addEventListener('change', () => this.updatePreviewHighlight());
        document.getElementById('modalLonCol').addEventListener('change', () => this.updatePreviewHighlight());
        document.getElementById('modalUseGeocoding').addEventListener('change', () => this.onGeocodingToggle());

        // Control buttons
        document.getElementById('skipBtn').addEventListener('click', () => this.skip());
        document.getElementById('exportBtn').addEventListener('click', () => this.export());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.onKeyDown(e));

        // Address list toggle
        document.getElementById('addressListToggle').addEventListener('click', () => this.toggleAddressList());

        // Address list filters and controls
        document.getElementById('searchBox').addEventListener('input', (e) => {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                this.addressList.searchQuery = e.target.value;
                this.addressList.currentPage = 1;
                this.loadAddressList();
            }, 300);
        });

        document.getElementById('searchBox').addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                clearTimeout(this.searchTimeout);
                const query = e.target.value.trim();

                if (!query) {
                    return;
                }

                // Set filters for street-based geocoding workflow
                this.addressList.searchQuery = query;
                this.addressList.filterStatus = ''; // Show all addresses for the street
                this.addressList.currentPage = 1;

                // Update UI to reflect filters
                document.getElementById('statusFilter').value = '';

                // Load filtered list
                const result = await this.loadAddressList();
                const addresses = result && Array.isArray(result.addresses)
                    ? result.addresses
                    : this.currentPageAddresses;

                // Jump to first result and focus map
                await this.jumpToFirstSearchResult(addresses);
            }
        });

        document.getElementById('statusFilter').addEventListener('change', (e) => {
            this.addressList.filterStatus = e.target.value;
            this.addressList.currentPage = 1;
            this.loadAddressList();
        });

        document.getElementById('streetFilter').addEventListener('change', (e) => {
            this.addressList.filterStreet = e.target.value;
            this.addressList.currentPage = 1;
            this.loadAddressList();
        });

        document.getElementById('perPageSelect').addEventListener('change', (e) => {
            this.addressList.perPage = parseInt(e.target.value);
            this.addressList.currentPage = 1;
            this.loadAddressList();
        });

        document.getElementById('autoAdvanceToggle').addEventListener('change', (e) => {
            this.autoAdvanceEnabled = e.target.checked;
        });

        // Pagination controls
        document.getElementById('firstPageBtn').addEventListener('click', () => this.goToPage(1));
        document.getElementById('prevPageBtn').addEventListener('click', () => this.goToPage(this.addressList.currentPage - 1));
        document.getElementById('nextPageBtn').addEventListener('click', () => this.goToPage(this.addressList.currentPage + 1));
        document.getElementById('lastPageBtn').addEventListener('click', () => this.goToPage(this.addressList.totalPages));

        // Table sorting
        document.querySelectorAll('.sortable').forEach(header => {
            header.addEventListener('click', () => this.sortByColumn(header.dataset.sort));
        });
    }


    // API Calls
    async apiCall(endpoint, method = 'GET', data = null) {
        try {
            const options = {
                method,
                headers: {
                    'Content-Type': 'application/json'
                }
            };

            if (data) {
                options.body = JSON.stringify(data);
            }

            const response = await fetch(endpoint, options);
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Request failed');
            }

            return result;
        } catch (error) {
            console.error('API Error:', error);
            alert(`Error: ${error.message}`);
            throw error;
        }
    }

    async onFileSelected(e) {
        const file = e.target.files[0];
        if (!file) return;

        try {
            // Read file content
            const text = await this.readFileAsText(file);

            // Parse CSV
            this.parseCSV(text);

            // Detect if this is a backup CSV or new address list
            if (this.isBackupCSV()) {
                // Handle as backup restore
                await this.handleBackupRestore(text, e.target);
            } else {
                // Handle as new address import
                this.showImportModal();
            }
        } catch (error) {
            alert('Error reading file: ' + error.message);
            // Clear the file input
            e.target.value = '';
        }
    }

    async handleBackupRestore(text, fileInput) {
        // Confirm before restoring
        const confirmRestore = confirm(
            'This appears to be a backup export. Restoring will replace ALL existing data. Are you sure you want to continue?'
        );

        if (!confirmRestore) {
            // Clear the file input
            fileInput.value = '';
            return;
        }

        try {
            // Send to backup import endpoint
            const response = await fetch('/api/import_backup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    csv_data: text
                })
            });

            const result = await response.json();

            if (result.success) {
                alert(`Successfully restored ${result.imported} addresses from backup!`);

                // Reload the application state
                await this.loadCurrentAddress();
                await this.updateProgress();
                await this.loadStreets();
                await this.loadAddressList();
                this.scheduleLoadGeocodedPoints(0);
            } else {
                alert('Error restoring backup: ' + (result.error || 'Unknown error'));
            }
        } catch (error) {
            alert('Error restoring backup: ' + error.message);
        } finally {
            // Clear the file input
            fileInput.value = '';
        }
    }

    parseCSV(text) {
        // Simple CSV parser (assumes comma-separated, handles quoted values)
        const lines = text.trim().split('\n');

        if (lines.length === 0) {
            throw new Error('CSV file is empty');
        }

        // Parse header row
        this.csvColumns = this.parseCSVLine(lines[0]);

        // Parse data rows (first 5 for preview)
        this.csvRows = [];
        for (let i = 1; i < Math.min(6, lines.length); i++) {
            this.csvRows.push(this.parseCSVLine(lines[i]));
        }

        // Store full CSV data
        this.csvData = text;
    }

    isBackupCSV() {
        // Detect if CSV is a backup export by checking for backup-specific columns
        const backupColumns = ['status', 'timestamp', 'sort_order'];

        // Check if any of the backup columns are present
        return backupColumns.some(col => this.csvColumns.includes(col));
    }

    parseCSVLine(line) {
        // Simple CSV line parser (handles basic quoted values)
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current.trim());
        return result;
    }

    showImportModal() {
        const modal = document.getElementById('csvModal');

        // Populate column dropdowns
        const streetSelect = document.getElementById('modalStreetCol');
        const numberSelect = document.getElementById('modalNumberCol');
        const latSelect = document.getElementById('modalLatCol');
        const lonSelect = document.getElementById('modalLonCol');
        const geocodingToggle = document.getElementById('modalUseGeocoding');

        streetSelect.innerHTML = '';
        numberSelect.innerHTML = '';
        latSelect.innerHTML = '<option value="">-- Select latitude column --</option>';
        lonSelect.innerHTML = '<option value="">-- Select longitude column --</option>';
        if (geocodingToggle) {
            geocodingToggle.checked = false;
        }

        this.csvColumns.forEach((col, index) => {
            const option1 = document.createElement('option');
            option1.value = col;
            option1.textContent = col;
            streetSelect.appendChild(option1);

            const option2 = document.createElement('option');
            option2.value = col;
            option2.textContent = col;
            numberSelect.appendChild(option2);

            const option3 = document.createElement('option');
            option3.value = col;
            option3.textContent = col;
            latSelect.appendChild(option3);

            const option4 = document.createElement('option');
            option4.value = col;
            option4.textContent = col;
            lonSelect.appendChild(option4);
        });

        // Auto-select based on common names
        this.autoSelectColumns(streetSelect, numberSelect, latSelect, lonSelect);
        this.onGeocodingToggle();

        // Render preview table
        this.renderPreviewTable();

        // Show modal
        modal.classList.add('show');

        // Add ESC key handler
        this.escapeHandler = (e) => {
            if (e.key === 'Escape') this.closeModal();
        };
        document.addEventListener('keydown', this.escapeHandler);
    }

    autoSelectColumns(streetSelect, numberSelect, latSelect, lonSelect) {
        // Try to auto-detect street column
        const possibleStreetNames = ['street', 'street_name', 'streetname', 'address', 'strasse'];
        for (const name of possibleStreetNames) {
            const option = Array.from(streetSelect.options).find(
                opt => opt.value.toLowerCase() === name
            );
            if (option) {
                streetSelect.value = option.value;
                break;
            }
        }

        // If no match, select first column
        if (!streetSelect.value && streetSelect.options.length > 0) {
            streetSelect.value = streetSelect.options[0].value;
        }

        // Try to auto-detect number column
        const possibleNumberNames = ['number', 'num', 'no', 'house_number', 'housenumber', 'nr'];
        for (const name of possibleNumberNames) {
            const option = Array.from(numberSelect.options).find(
                opt => opt.value.toLowerCase() === name
            );
            if (option) {
                numberSelect.value = option.value;
                break;
            }
        }

        // If no match, select second column if available
        if (!numberSelect.value && numberSelect.options.length > 1) {
            numberSelect.value = numberSelect.options[1].value;
        } else if (!numberSelect.value && numberSelect.options.length > 0) {
            numberSelect.value = numberSelect.options[0].value;
        }

        // Try to auto-detect latitude column
        const possibleLatNames = ['lat', 'latitude', 'y', 'breitengrad'];
        for (const name of possibleLatNames) {
            const option = Array.from(latSelect.options).find(
                opt => opt.value.toLowerCase() === name
            );
            if (option) {
                latSelect.value = option.value;
                break;
            }
        }

        // Try to auto-detect longitude column
        const possibleLonNames = ['lon', 'lng', 'long', 'longitude', 'x', 'längengrad', 'laengengrad'];
        for (const name of possibleLonNames) {
            const option = Array.from(lonSelect.options).find(
                opt => opt.value.toLowerCase() === name
            );
            if (option) {
                lonSelect.value = option.value;
                break;
            }
        }

        // Update preview highlight
        this.updatePreviewHighlight();
    }

    renderPreviewTable() {
        const table = document.getElementById('previewTable');

        // Build table HTML
        let html = '<thead><tr>';
        this.csvColumns.forEach(col => {
            html += `<th>${this.escapeHtml(col)}</th>`;
        });
        html += '</tr></thead><tbody>';

        this.csvRows.forEach(row => {
            html += '<tr>';
            row.forEach(cell => {
                html += `<td>${this.escapeHtml(cell)}</td>`;
            });
            html += '</tr>';
        });

        html += '</tbody>';
        table.innerHTML = html;
    }

    updatePreviewHighlight() {
        const streetCol = document.getElementById('modalStreetCol').value;
        const numberCol = document.getElementById('modalNumberCol').value;
        const latCol = document.getElementById('modalLatCol').value;
        const lonCol = document.getElementById('modalLonCol').value;
        const useGeocoding = document.getElementById('modalUseGeocoding').checked;

        const streetIndex = this.csvColumns.indexOf(streetCol);
        const numberIndex = this.csvColumns.indexOf(numberCol);
        const latIndex = this.csvColumns.indexOf(latCol);
        const lonIndex = this.csvColumns.indexOf(lonCol);

        // Remove all highlights
        document.querySelectorAll('#previewTable th, #previewTable td').forEach(cell => {
            cell.classList.remove('selected-column');
        });

        // Add highlights to selected columns
        const selectedIndices = new Set();

        if (streetIndex >= 0) {
            selectedIndices.add(streetIndex);
        }
        if (numberIndex >= 0) {
            selectedIndices.add(numberIndex);
        }
        if (useGeocoding && latIndex >= 0) {
            selectedIndices.add(latIndex);
        }
        if (useGeocoding && lonIndex >= 0) {
            selectedIndices.add(lonIndex);
        }

        selectedIndices.forEach(index => {
            document.querySelectorAll(`#previewTable tr > :nth-child(${index + 1})`).forEach(cell => {
                cell.classList.add('selected-column');
            });
        });
    }

    onGeocodingToggle() {
        const geocodingFields = document.getElementById('modalGeocodingFields');
        const useGeocoding = document.getElementById('modalUseGeocoding').checked;

        if (geocodingFields) {
            geocodingFields.style.display = useGeocoding ? 'grid' : 'none';
        }

        this.updatePreviewHighlight();
    }

    closeModal() {
        const modal = document.getElementById('csvModal');
        modal.classList.remove('show');

        // Clear file input
        document.getElementById('csvFile').value = '';

        // Remove ESC key handler
        if (this.escapeHandler) {
            document.removeEventListener('keydown', this.escapeHandler);
        }
    }

    async confirmImport() {
        const streetCol = document.getElementById('modalStreetCol').value;
        const numberCol = document.getElementById('modalNumberCol').value;
        const useGeocoding = document.getElementById('modalUseGeocoding').checked;
        const latCol = document.getElementById('modalLatCol').value;
        const lonCol = document.getElementById('modalLonCol').value;

        if (!streetCol || !numberCol) {
            alert('Please select both street and number columns');
            return;
        }

        if (useGeocoding && (!latCol || !lonCol)) {
            alert('Please select both latitude and longitude columns to import existing geocoding');
            return;
        }

        try {
            const payload = {
                csv_data: this.csvData,
                street_column: streetCol,
                number_column: numberCol
            };

            if (useGeocoding) {
                payload.lat_column = latCol;
                payload.lon_column = lonCol;
            }

            // Send to backend
            const result = await this.apiCall('/api/import_data', 'POST', payload);

            // Close modal
            this.closeModal();

            // Show success message
            alert(result.message);

            // Refresh data
            this.loadCurrentAddress();
            this.updateProgress();
            this.loadStreets();
            this.loadAddressList();
            this.scheduleLoadGeocodedPoints(0); // Clear old markers and load new ones
        } catch (error) {
            // Error already handled in apiCall
        }
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }

    async loadAvailableMaps() {
        try {
            const result = await this.apiCall('/api/maps');

            // Auto-load tiled maps on startup
            await this.autoLoadTiledMaps(result.maps);
        } catch (error) {
            // Error already handled
        }
    }

    async autoLoadTiledMaps(maps) {
        // Load all MBTiles maps
        for (const mapName of maps) {
            console.log(`Auto-loading MBTiles map: ${mapName}`);
            await this.loadTileLayer(mapName);
        }
    }

    async loadTileLayer(mapName) {
        try {
            console.log(`Loading tile layer: ${mapName}`);

            // Create tile layer with performance optimizations
            // All maps are served from MBTiles
            const tileOptions = {
                tms: true, // TMS tiling scheme (Y axis inverted)
                opacity: 1,
                minZoom: 13,
                maxZoom: 20,
                maxNativeZoom: 20, // Maximum zoom level with actual tiles
                attribution: 'Historical Map',
                keepBuffer: 4, // Keep more tiles loaded for smoother panning
                updateWhenIdle: true, // Only update tiles when panning stops
                updateWhenZooming: false, // Don't update during zoom for better performance
                tileSize: 256, // Standard tile size
                crossOrigin: true // Enable CORS if needed
            };

            const overlay = L.tileLayer(`/tiles/${mapName}/{z}/{x}/{y}.png`, tileOptions);

            // Store overlay
            this.overlayLayers[mapName] = overlay;

            // Add to layer control with clean display name
            this.layerControl.addOverlay(overlay, mapName, 'Historical Maps');

            // Remove "No overlay" dummy layer since we're loading a real map
            if (this.map.hasLayer(this.noOverlayLayer)) {
                this.map.removeLayer(this.noOverlayLayer);
            }

            // Add to map
            overlay.addTo(this.map);

            console.log('Tile layer loaded successfully:', mapName);

            this.syncMarkerDragState();
        } catch (error) {
            console.error('Error loading tile layer:', error);
            alert(`Failed to load tile layer: ${error.message}`);
        }
    }

    async loadCurrentAddress() {
        try {
            // Get current map viewport center for proximity-based ordering
            const center = this.map.getCenter();
            const viewportLat = center.lat;
            const viewportLon = center.lng;

            // Get last geocoded street (if any) to detect street changes
            const lastStreet = this.currentAddress ? this.currentAddress.street : null;

            // Build query parameters
            const params = new URLSearchParams({
                viewport_lat: viewportLat,
                viewport_lon: viewportLon
            });

            if (lastStreet) {
                params.append('last_street', lastStreet);
            }

            const result = await this.apiCall(`/api/current?${params}`);
            this.currentAddress = result.address;
            this.updateAddressDisplay();
        } catch (error) {
            // Error already handled
        }
    }

    async loadGeocodedPoints() {
        if (!this.map) return;

        try {
            const params = new URLSearchParams();

            if (this.markerFetchLimit && this.markerFetchLimit > 0) {
                params.set('limit', this.markerFetchLimit);
            }

            const requestToken = ++this.pointsRequestToken;
            const query = params.toString();
            const endpoint = query ? `/api/points?${query}` : '/api/points';
            const result = await this.apiCall(endpoint);

            if (requestToken !== this.pointsRequestToken) {
                // A newer request supersedes this one
                return;
            }

            this.geocodedPoints = result.points || [];
            this.streetColorMap = null; // Invalidate cache when points change

            // Group points by map_name
            this.groupPointsByMap();

            // Create/update marker layers for each map
            this.updateMarkerLayers();

            // Render markers on all layers
            this.renderMarkers();
        } catch (error) {
            // Error already handled
        }
    }

    groupPointsByMap() {
        // Group points by map_name
        this.markerLayersByMapName = {};

        this.geocodedPoints.forEach(point => {
            const mapName = point.map_name || 'Unknown Map';
            if (!this.markerLayersByMapName[mapName]) {
                this.markerLayersByMapName[mapName] = [];
            }
            this.markerLayersByMapName[mapName].push(point);
        });
    }

    updateMarkerLayers() {
        // Get list of map names from the grouped points
        const mapNames = Object.keys(this.markerLayersByMapName);

        // Remove layers that no longer have points
        for (let mapName in this.canvasMarkerLayers) {
            if (!mapNames.includes(mapName)) {
                // Remove from map and layer control
                if (this.map.hasLayer(this.canvasMarkerLayers[mapName])) {
                    this.map.removeLayer(this.canvasMarkerLayers[mapName]);
                }
                this.layerControl.removeLayer(this.canvasMarkerLayers[mapName]);
                delete this.canvasMarkerLayers[mapName];
            }
        }

        // Create new layers for maps that don't have them yet
        mapNames.forEach(mapName => {
            if (!this.canvasMarkerLayers[mapName]) {
                // Create new canvas marker layer
                const layer = L.canvasIconLayer({ padding: 0.3 });
                this.canvasMarkerLayers[mapName] = layer;

                // Add to map
                layer.addTo(this.map);

                // Add to layer control
                const displayName = mapName === 'Unknown Map' ? '(No map)' : `${mapName} markers`;
                this.layerControl.addOverlay(layer, displayName, 'Geocoded Markers');
            }
        });
    }

    scheduleLoadGeocodedPoints(delay = 200) {
        if (this.pointsReloadTimer) {
            clearTimeout(this.pointsReloadTimer);
        }

        this.pointsReloadTimer = setTimeout(() => {
            this.pointsReloadTimer = null;
            this.loadGeocodedPoints();
        }, delay);
    }

    updateAddressDisplay() {
        const streetEl = document.querySelector('.street-name');
        const numberEl = document.querySelector('.house-number');

        if (this.currentAddress) {
            streetEl.textContent = this.currentAddress.street;
            numberEl.textContent = this.currentAddress.number;
        } else {
            streetEl.textContent = 'All done!';
            numberEl.textContent = '✓';
        }
    }

    async updateProgress() {
        try {
            const result = await this.apiCall('/api/progress');
            const stats = result.progress;

            const total = stats.total;
            const geocoded = stats.geocoded;
            const skipped = stats.skipped;
            const pending = stats.pending;

            const percentage = total > 0 ? Math.round((geocoded / total) * 100) : 0;

            document.getElementById('progressFill').style.width = percentage + '%';
            document.getElementById('progressText').textContent =
                `${geocoded} / ${total} (${percentage}%)`;
            document.getElementById('geocodedCount').textContent = geocoded;
            document.getElementById('skippedCount').textContent = skipped;
            document.getElementById('pendingCount').textContent = pending;
        } catch (error) {
            // Error already handled
        }
    }

    calculateHaversineDistance(lat1, lon1, lat2, lon2) {
        // Calculate distance between two lat/lon points in meters using Haversine formula
        const R = 6371000; // Earth's radius in meters
        const toRad = (deg) => deg * Math.PI / 180;

        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    buildStreetColorMap() {
        // Define a nice, differentiable color palette
        const colorPalette = [
            '#e74c3c',  // Red
            '#3498db',  // Blue
            '#2ecc71',  // Green
            '#f39c12',  // Orange
            '#9b59b6',  // Purple
            '#1abc9c',  // Teal
            '#e67e22',  // Carrot
            '#8e44ad',  // Deep purple
            '#16a085',  // Dark teal
            '#c0392b',  // Dark red
            '#d35400',  // Burnt orange
            '#2c3e50',  // Midnight blue
            '#2980b9',  // Sky blue
            '#27ae60',  // Forest green
            '#f1c40f',  // Sunflower
            '#7f8c8d',  // Flat gray
            '#c0399f',  // Magenta
            '#34495e',  // Dark slate
            '#95a5a6',  // Silver
            '#e84393',  // Pink
        ];

        // Step 1: Calculate centroid for each street
        const streetData = {};
        this.geocodedPoints.forEach(point => {
            if (!point.street || !this.isValidCoordinate(point.lat) || !this.isValidCoordinate(point.lon)) {
                return;
            }

            if (!streetData[point.street]) {
                streetData[point.street] = {
                    latSum: 0,
                    lonSum: 0,
                    count: 0
                };
            }

            streetData[point.street].latSum += point.lat;
            streetData[point.street].lonSum += point.lon;
            streetData[point.street].count += 1;
        });

        // Calculate centroids
        const streets = Object.keys(streetData).map(street => ({
            name: street,
            lat: streetData[street].latSum / streetData[street].count,
            lon: streetData[street].lonSum / streetData[street].count,
            count: streetData[street].count
        }));

        // Sort by count (descending) - assign colors to important streets first
        streets.sort((a, b) => b.count - a.count);

        // Step 2: Greedy graph coloring based on spatial proximity
        const PROXIMITY_THRESHOLD = 500; // meters - streets within this distance are considered "nearby"
        const colorMap = {};

        streets.forEach(street => {
            // Find nearby streets that already have colors assigned
            const nearbyColors = new Set();

            streets.forEach(otherStreet => {
                if (otherStreet.name === street.name) return;
                if (colorMap[otherStreet.name] === undefined) return; // Skip if not colored yet

                const distance = this.calculateHaversineDistance(
                    street.lat, street.lon,
                    otherStreet.lat, otherStreet.lon
                );

                if (distance < PROXIMITY_THRESHOLD) {
                    nearbyColors.add(colorMap[otherStreet.name]);
                }
            });

            // Assign the first available color not used by nearby streets
            let assignedColor = 0;
            for (let i = 0; i < colorPalette.length; i++) {
                if (!nearbyColors.has(i)) {
                    assignedColor = i;
                    break;
                }
            }

            colorMap[street.name] = assignedColor;
        });

        return colorMap;
    }

    getStreetColor(street) {
        const colorPalette = [
            '#e74c3c',  // Red
            '#3498db',  // Blue
            '#2ecc71',  // Green
            '#f39c12',  // Orange
            '#9b59b6',  // Purple
            '#1abc9c',  // Teal
            '#e67e22',  // Carrot
            '#8e44ad',  // Deep purple
            '#16a085',  // Dark teal
            '#c0392b',  // Dark red
            '#d35400',  // Burnt orange
            '#2c3e50',  // Midnight blue
            '#2980b9',  // Sky blue
            '#27ae60',  // Forest green
            '#f1c40f',  // Sunflower
            '#7f8c8d',  // Flat gray
            '#c0399f',  // Magenta
            '#34495e',  // Dark slate
            '#95a5a6',  // Silver
            '#e84393',  // Pink
        ];

        // Build color map if not cached
        if (!this.streetColorMap && this.geocodedPoints && this.geocodedPoints.length > 0) {
            this.streetColorMap = this.buildStreetColorMap();
        }

        // Look up color for this street
        const colorIndex = this.streetColorMap && this.streetColorMap[street] !== undefined
            ? this.streetColorMap[street]
            : 0;

        return colorPalette[colorIndex];
    }

    getMarkerSize(isRecent) {
        // Calculate marker size based on zoom level
        const zoom = this.map.getZoom();

        // Base sizes at zoom 13 (default)
        const baseSize = isRecent ? 12 : 10;

        // Scale factor: adjust size based on zoom level
        // At zoom 10: ~60% of base, at zoom 13: 100%, at zoom 18: ~250%
        const scaleFactor = Math.pow(1.15, zoom - 13);

        // Calculate final size with min/max bounds
        const size = Math.max(6, Math.min(30, baseSize * scaleFactor));

        return Math.round(size);
    }

    getEffectiveMaxZoom() {
        if (!this.map) return 19;

        let maxZoom = Number.isFinite(this.map.options.maxZoom) ? this.map.options.maxZoom : -Infinity;

        Object.values(this.baseLayers || {}).forEach(layer => {
            const layerMax = layer && layer.options && Number.isFinite(layer.options.maxZoom)
                ? layer.options.maxZoom
                : -Infinity;
            if (layerMax > maxZoom) {
                maxZoom = layerMax;
            }
        });

        Object.values(this.overlayLayers || {}).forEach(layer => {
            const layerMax = layer && layer.options && Number.isFinite(layer.options.maxZoom)
                ? layer.options.maxZoom
                : -Infinity;
            if (layerMax > maxZoom) {
                maxZoom = layerMax;
            }
        });

        if (!Number.isFinite(maxZoom) || maxZoom === -Infinity) {
            maxZoom = 19;
        }

        return maxZoom;
    }

    canDragMarkers() {
        if (!this.map) return false;

        const maxZoom = this.getEffectiveMaxZoom();
        const dragThreshold = Math.max(maxZoom - this.markerDragZoomBuffer, 0);
        return this.map.getZoom() >= dragThreshold;
    }

    syncMarkerDragState() {
        if (!this.map) return;

        const canDrag = this.canDragMarkers();
        const container = this.map.getContainer();

        if (!canDrag) {
            container.classList.remove('geocoder-map--marker-hover');
        }

        if (this.activeMarker && this.activeMarker.dragging) {
            if (canDrag) {
                this.activeMarker.dragging.enable();
                this.activeMarker.options.autoPan = true;
            } else {
                this.activeMarker.dragging.disable();
                this.activeMarker.options.autoPan = false;
            }
        }

        if (this.activeMarker) {
            this.activeMarker.options.autoPan = canDrag;
        }
    }

    createMarkerIcon(point, options = {}) {
        const isRecent = options.isRecent || false;
        const highlight = options.highlight || false;
        const size = Math.round(this.getMarkerSize(isRecent) * (highlight ? 1.15 : 1));
        const color = options.color || this.getStreetColor(point.street || '');
        const label = this.escapeHtml(point.number ?? '');
        const fontSize = Math.max(8, Math.min(16, Math.round(size * 0.55)));

        const classes = ['address-marker', 'draggable-marker'];
        if (isRecent) classes.push('address-marker--recent');
        if (highlight) classes.push('address-marker--active');

        return L.divIcon({
            className: 'custom-div-icon',
            html: `
                <div class="${classes.join(' ')}"
                     style="background-color: ${color}; width: ${size}px; height: ${size}px;">
                    <span class="address-marker__label" style="font-size: ${fontSize}px;">${label}</span>
                </div>
            `,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2]
        });
    }

    renderMarkers() {
        const currentId = this.currentAddress ? this.currentAddress.id : null;
        const draggingId = this.draggingMarker ? this.draggingMarker.id : null;

        // Render markers for each map layer
        for (let mapName in this.markerLayersByMapName) {
            const layer = this.canvasMarkerLayers[mapName];
            if (!layer) continue;

            const points = this.markerLayersByMapName[mapName];
            const markers = [];

            points.forEach((point, index) => {
                if (!this.isValidCoordinate(point.lat) || !this.isValidCoordinate(point.lon)) {
                    return;
                }

                if (draggingId != null && point.id === draggingId) {
                    return; // Skip while dragging; draggable marker handles display
                }

                const isRecent = index < 5;
                const isActive = currentId != null && point.id === currentId;
                const size = this.getMarkerSize(isRecent);
                const color = this.getStreetColor(point.street || '');

                markers.push({
                    id: point.id,
                    lat: point.lat,
                    lon: point.lon,
                    color,
                    fillStyle: color,
                    strokeStyle: '#ffffff',
                    lineWidth: isActive ? 3 : 2,
                    label: point.number != null ? String(point.number) : '',
                    fontSize: Math.max(9, Math.round(size * 0.5)),
                    fontWeight: isActive ? '700' : '600',
                    textColor: '#ffffff',
                    size: isActive ? size + 4 : size,
                    highlight: isActive,
                    highlightColor: '#2ecc71',
                    highlightWidth: 2,
                    opacity: 1
                });
            });

            layer.setMarkers(markers);
        }

        this.updateActiveMarker();
    }

    updateMarkerSizes() {
        this.renderMarkers();
    }

    findMarkerAtLatLng(latlng, tolerancePx = null) {
        if (!this.map || !latlng || !this.geocodedPoints || this.geocodedPoints.length === 0) {
            return null;
        }

        const baseTolerance = tolerancePx != null
            ? tolerancePx
            : Math.max(this.markerHitTolerance, Math.round(this.getMarkerSize(false) * 0.6));

        const clickPoint = this.map.latLngToLayerPoint(latlng);
        if (!clickPoint) {
            return null;
        }

        let nearestPoint = null;
        let nearestDistance = Infinity;

        this.geocodedPoints.forEach(point => {
            if (!this.isValidCoordinate(point.lat) || !this.isValidCoordinate(point.lon)) {
                return;
            }

            const markerPoint = this.map.latLngToLayerPoint([point.lat, point.lon]);
            const distance = clickPoint.distanceTo(markerPoint);

            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestPoint = point;
            }
        });

        if (!nearestPoint || nearestDistance > baseTolerance) {
            return null;
        }

        return { point: nearestPoint, distance: nearestDistance };
    }

    onMapMouseMove(e) {
        if (!this.map || this.isCanvasMarkerDragging) return;

        const container = this.map.getContainer();
        const hit = this.findMarkerAtLatLng(e.latlng);

        // Only show drag cursor if hovering over a selected marker and can drag
        if (hit && this.canDragMarkers() && this.selectedMarkerId === hit.point.id) {
            container.classList.add('geocoder-map--marker-hover');
        } else {
            container.classList.remove('geocoder-map--marker-hover');
        }
    }

    onMapMouseDown(e) {
        if (!this.map) return;
        if (e.originalEvent.button !== 0) return; // left click only
        if (this.isCanvasMarkerDragging || this.pendingMarkerDrag) return;
        if (!this.canDragMarkers()) return;

        const target = e.originalEvent.target;
        if (target && target.closest('.leaflet-control')) {
            return;
        }

        const hit = this.findMarkerAtLatLng(e.latlng);
        if (!hit) {
            return;
        }

        // Only allow dragging if this marker is already selected
        if (this.selectedMarkerId !== hit.point.id) {
            return;
        }

        this.pendingMarkerDrag = {
            point: hit.point,
            startEvent: e,
            startLatLng: e.latlng
        };

        document.addEventListener('mousemove', this.handlePendingDragMove);
        document.addEventListener('mouseup', this.handlePendingDragUp);
    }

    onPendingMarkerDragMove(event) {
        if (!this.pendingMarkerDrag || !this.map) return;
        if (!this.canDragMarkers()) {
            this.pendingMarkerDrag = null;
            document.removeEventListener('mousemove', this.handlePendingDragMove);
            document.removeEventListener('mouseup', this.handlePendingDragUp);
            return;
        }

        const startLatLng = this.pendingMarkerDrag.startLatLng;
        const currentLatLng = this.map.mouseEventToLatLng(event);

        if (!startLatLng || !currentLatLng) {
            return;
        }

        const startPoint = this.map.latLngToContainerPoint(startLatLng);
        const currentPoint = this.map.latLngToContainerPoint(currentLatLng);

        if (!startPoint || !currentPoint) {
            return;
        }

        const distance = startPoint.distanceTo(currentPoint);
        if (distance < 4) {
            return;
        }

        document.removeEventListener('mousemove', this.handlePendingDragMove);
        document.removeEventListener('mouseup', this.handlePendingDragUp);

        const pending = this.pendingMarkerDrag;
        this.pendingMarkerDrag = null;

        this.skipNextMapClick = true;
        this.startMarkerDrag(pending.point, pending.startEvent);
        this.onMarkerDragMove(event);
    }

    onPendingMarkerDragUp(event) {
        if (!this.pendingMarkerDrag) return;

        document.removeEventListener('mousemove', this.handlePendingDragMove);
        document.removeEventListener('mouseup', this.handlePendingDragUp);
        this.pendingMarkerDrag = null;
    }

    async onMapClick(e) {
        if (!this.map) return;
        if (this.skipNextMapClick) {
            this.skipNextMapClick = false;
            return;
        }

        const hit = this.findMarkerAtLatLng(e.latlng);
        if (!hit) {
            this.closeMarkerPopup();
            this.selectedMarkerId = null; // Deselect marker when clicking empty space
            return;
        }

        // Set the selected marker for dragging
        this.selectedMarkerId = hit.point.id;

        try {
            await this.selectAddress(hit.point.id, { reloadList: false, focus: false });
            this.showMarkerPopup(this.currentAddress || hit.point);
        } catch (error) {
            // Error already handled in selectAddress
        }
    }

    startMarkerDrag(point, leafletEvent) {
        if (!this.map || !point) return;
        if (!this.canDragMarkers()) return;
        this.pendingMarkerDrag = null;

        this.isCanvasMarkerDragging = true;
        const container = this.map.getContainer();
        container.classList.add('geocoder-map--marker-dragging');
        container.classList.remove('geocoder-map--marker-hover');

        const index = this.geocodedPoints.findIndex(p => p.id === point.id);

        this.draggingMarker = {
            id: point.id,
            index,
            originalLat: point.lat,
            originalLon: point.lon,
            currentLat: point.lat,
            currentLon: point.lon
        };

        this.currentAddress = Object.assign({}, this.currentAddress || {}, point);
        this.updateAddressDisplay();
        this.renderMarkers();
        this.closeMarkerPopup();

        this.map.dragging.disable();

        document.addEventListener('mousemove', this.handleMarkerDragMove);
        document.addEventListener('mouseup', this.handleMarkerDragEnd, { once: true });

        if (leafletEvent && leafletEvent.originalEvent) {
            L.DomEvent.stop(leafletEvent.originalEvent);
            this.onMarkerDragMove(leafletEvent.originalEvent);
        }
    }

    onMarkerDragMove(event) {
        if (!this.map || !this.draggingMarker || !this.isCanvasMarkerDragging) return;

        const latlng = this.map.mouseEventToLatLng(event);
        if (!latlng) return;

        const { id, index } = this.draggingMarker;

        if (index >= 0 && index < this.geocodedPoints.length) {
            this.geocodedPoints[index].lat = latlng.lat;
            this.geocodedPoints[index].lon = latlng.lng;
        }

        if (this.currentAddress && this.currentAddress.id === id) {
            this.currentAddress.lat = latlng.lat;
            this.currentAddress.lon = latlng.lng;
        }

        this.draggingMarker.currentLat = latlng.lat;
        this.draggingMarker.currentLon = latlng.lng;

        if (this.activeMarker) {
            this.activeMarker.setLatLng(latlng);
        }
    }

    async onMarkerDragEnd(event) {
        if (!this.map || !this.draggingMarker) return;

        document.removeEventListener('mousemove', this.handleMarkerDragMove);
        document.removeEventListener('mouseup', this.handleMarkerDragEnd);

        const container = this.map.getContainer();
        container.classList.remove('geocoder-map--marker-dragging');

        this.map.dragging.enable();

        const { id, index, originalLat, originalLon, currentLat, currentLon } = this.draggingMarker;

        this.isCanvasMarkerDragging = false;
        this.draggingMarker = null;
        this.selectedMarkerId = null; // Clear selection after drag ends

        const lat = this.isValidCoordinate(currentLat) ? currentLat : originalLat;
        const lon = this.isValidCoordinate(currentLon) ? currentLon : originalLon;

        if (index >= 0 && index < this.geocodedPoints.length) {
            this.geocodedPoints[index].lat = lat;
            this.geocodedPoints[index].lon = lon;
        }

        if (this.currentAddress && this.currentAddress.id === id) {
            this.currentAddress.lat = lat;
            this.currentAddress.lon = lon;
        }

        this.renderMarkers();
        this.updateActiveMarker();

        const moved = Math.abs(lat - originalLat) > 1e-9 || Math.abs(lon - originalLon) > 1e-9;

        if (!moved) {
            this.skipNextMapClick = true;
            return;
        }

        try {
            await this.updateMarkerPosition(id, lat, lon);
            await this.selectAddress(id, { reloadList: false, focus: false });
        } catch (error) {
            // updateMarkerPosition handles error messaging and reloads points if needed
        } finally {
            this.skipNextMapClick = true;
        }
    }

    showMarkerPopup(point) {
        if (!this.map || !point || !this.isValidCoordinate(point.lat) || !this.isValidCoordinate(point.lon)) {
            return;
        }

        this.closeMarkerPopup();

        const street = this.escapeHtml(point.street || 'Unknown street');
        const number = this.escapeHtml(point.number != null ? String(point.number) : '');

        const content = `
            <div class="marker-popup">
                <div class="marker-popup__street">${street}</div>
                ${number ? `<div class="marker-popup__number">${number}</div>` : ''}
                <div class="marker-popup__hint">Drag the highlighted marker to adjust position</div>
            </div>
        `;

        this.markerInfoPopup = L.popup({
            closeButton: false,
            autoClose: true,
            closeOnEscapeKey: true,
            offset: L.point(0, -10),
            className: 'marker-popup'
        })
            .setLatLng([point.lat, point.lon])
            .setContent(content)
            .openOn(this.map);
    }

    closeMarkerPopup() {
        if (this.markerInfoPopup) {
            this.map.closePopup(this.markerInfoPopup);
            this.markerInfoPopup = null;
        }
    }

    updateActiveMarker() {
        if (!this.map) return;

        if (this.activeMarker) {
            this.map.removeLayer(this.activeMarker);
            this.activeMarker = null;
        }

        if (!this.currentAddress ||
            !this.isValidCoordinate(this.currentAddress.lat) ||
            !this.isValidCoordinate(this.currentAddress.lon)) {
            return;
        }

        const icon = this.createMarkerIcon(this.currentAddress, {
            isRecent: false,
            highlight: true
        });

        const canDrag = this.canDragMarkers();

        this.activeMarker = L.marker([this.currentAddress.lat, this.currentAddress.lon], {
            icon,
            draggable: canDrag,
            autoPan: canDrag
        });

        this.activeMarker.on('dragend', (e) => {
            const newPos = e.target.getLatLng();
            this.updateMarkerPosition(this.currentAddress.id, newPos.lat, newPos.lng);
        });

        this.activeMarker.addTo(this.map);
        this.syncMarkerDragState();
    }

    // Actions
    onMapRightClick(e) {
        e.originalEvent.preventDefault();

        if (!this.currentAddress) {
            alert('No address to geocode. Import addresses first.');
            return;
        }

        // Prevent overlapping geocode operations
        if (this.isProcessingAction) {
            return;
        }

        const lat = e.latlng.lat;
        const lon = e.latlng.lng;

        this.geocodeCurrentAddress(lat, lon);
    }

    async advanceToNextAddress() {
        if (!this.currentAddress || !this.autoAdvanceEnabled) {
            return;
        }

        // Find current address in the list
        const currentIndex = this.currentPageAddresses.findIndex(
            addr => addr.id === this.currentAddress.id
        );

        if (currentIndex === -1) {
            // Current address not in view, reload list to find it
            await this.loadAddressList();
            return;
        }

        // Check if there's a next address on current page
        if (currentIndex < this.currentPageAddresses.length - 1) {
            // Advance to next address in current page
            const nextAddress = this.currentPageAddresses[currentIndex + 1];
            await this.selectAddress(nextAddress.id, {
                reloadList: false,
                focus: false
            });
        } else {
            // At end of current page, try to go to next page
            if (this.addressList.currentPage < this.addressList.totalPages) {
                // Load next page
                this.addressList.currentPage++;
                await this.loadAddressList();

                // Select first address on new page
                if (this.currentPageAddresses.length > 0) {
                    await this.selectAddress(this.currentPageAddresses[0].id, {
                        reloadList: false,
                        focus: false
                    });
                }
            }
            // If we're at the last page and last address, do nothing (stay on current)
        }
    }

    async geocodeCurrentAddress(lat, lon) {
        if (!this.currentAddress) {
            alert('No address to geocode');
            return;
        }

        // Prevent concurrent geocode operations
        if (this.isProcessingAction) {
            return;
        }

        this.isProcessingAction = true;

        try {
            await this.apiCall('/api/geocode', 'POST', {
                address_id: this.currentAddress.id,
                x: null,  // We're using lat/lon now instead of pixel coords
                y: null,
                lat: lat,
                lon: lon,
                map_name: this.currentHistoricalMap  // Include currently active historical map
            });

            // Flash marker at geocoded location
            this.flashMarker(lat, lon);

            // Update progress and reload points
            this.updateProgress();
            this.scheduleLoadGeocodedPoints(0);

            // Capture next address BEFORE reloading (in case current gets filtered out)
            const currentIndex = this.currentPageAddresses.findIndex(
                addr => addr.id === this.currentAddress.id
            );
            const nextAddressId = (currentIndex >= 0 && currentIndex < this.currentPageAddresses.length - 1)
                ? this.currentPageAddresses[currentIndex + 1].id
                : null;
            const wasInList = currentIndex >= 0;

            // Reload address list to update status
            await this.loadAddressList();

            // Advance to next address
            if (this.autoAdvanceEnabled) {
                if (nextAddressId) {
                    // Select the captured next address
                    await this.selectAddress(nextAddressId, {
                        reloadList: false,
                        focus: false
                    });
                } else if (!wasInList && this.currentPageAddresses.length > 0) {
                    // Current address wasn't in filtered list (e.g., clicked a geocoded marker)
                    // Advance to first address in filtered list to resume workflow
                    await this.selectAddress(this.currentPageAddresses[0].id, {
                        reloadList: false,
                        focus: false
                    });
                } else {
                    // At end of page, use normal advance logic
                    await this.advanceToNextAddress();
                }
            }

            // Update display
            this.updateAddressDisplay();
        } catch (error) {
            // Error already handled
        } finally {
            this.isProcessingAction = false;
        }
    }

    focusOnCoordinates(lat, lon, options = {}) {
        if (!this.map) return;

        const latNum = Number(lat);
        const lonNum = Number(lon);

        if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
            return;
        }

        const targetZoom = options.zoom ?? Math.max(this.map.getZoom(), 17);
        const duration = options.duration ?? 0.6;
        const animate = options.animate !== false;

        if (animate) {
            this.map.flyTo([latNum, lonNum], targetZoom, { animate: true, duration });
        } else {
            this.map.setView([latNum, lonNum], targetZoom, { animate: false });
        }

        if (options.flash) {
            this.flashMarker(latNum, lonNum);
        }
    }

    flashMarker(lat, lon) {
        const marker = L.circleMarker([lat, lon], {
            radius: 15,
            color: '#2ecc71',
            fillColor: '#2ecc71',
            fillOpacity: 0.8,
            weight: 3
        }).addTo(this.map);

        // Fade out and remove
        let opacity = 0.8;
        const interval = setInterval(() => {
            opacity -= 0.05;
            if (opacity <= 0) {
                clearInterval(interval);
                this.map.removeLayer(marker);
            } else {
                marker.setStyle({ fillOpacity: opacity });
            }
        }, 50);
    }

    async updateMarkerPosition(addressId, newLat, newLon) {
        try {
            await this.apiCall('/api/update_geocode', 'POST', {
                address_id: addressId,
                lat: newLat,
                lon: newLon
            });

            // Flash at new location to show success
            this.flashMarker(newLat, newLon);

            // Reload points to reflect updated position
            this.scheduleLoadGeocodedPoints(0);

            if (this.currentAddress && this.currentAddress.id === addressId) {
                this.currentAddress.lat = newLat;
                this.currentAddress.lon = newLon;
                this.updateActiveMarker();
            }

            const cachedPoint = this.geocodedPoints.find(p => p.id === addressId);
            if (cachedPoint) {
                cachedPoint.lat = newLat;
                cachedPoint.lon = newLon;
                this.renderMarkers();
            }

            // Update address list in case it affects sorting or display
            this.loadAddressList();
        } catch (error) {
            // Error already handled in apiCall
            // Reload markers to restore original position if update failed
            this.scheduleLoadGeocodedPoints(0);
        }
    }

    async skip() {
        if (!this.currentAddress) {
            alert('No address to skip');
            return;
        }

        // Prevent concurrent skip operations
        if (this.isProcessingAction) {
            return;
        }

        this.isProcessingAction = true;

        try {
            await this.apiCall('/api/skip', 'POST', {
                address_id: this.currentAddress.id
            });

            // Update progress
            this.updateProgress();

            // Capture next address BEFORE reloading (in case current gets filtered out)
            const currentIndex = this.currentPageAddresses.findIndex(
                addr => addr.id === this.currentAddress.id
            );
            const nextAddressId = (currentIndex >= 0 && currentIndex < this.currentPageAddresses.length - 1)
                ? this.currentPageAddresses[currentIndex + 1].id
                : null;
            const wasInList = currentIndex >= 0;

            // Reload address list to update status
            await this.loadAddressList();

            // Advance to next address
            if (this.autoAdvanceEnabled) {
                if (nextAddressId) {
                    // Select the captured next address
                    await this.selectAddress(nextAddressId, {
                        reloadList: false,
                        focus: false
                    });
                } else if (!wasInList && this.currentPageAddresses.length > 0) {
                    // Current address wasn't in filtered list (e.g., clicked a geocoded marker)
                    // Advance to first address in filtered list to resume workflow
                    await this.selectAddress(this.currentPageAddresses[0].id, {
                        reloadList: false,
                        focus: false
                    });
                } else {
                    // At end of page, use normal advance logic
                    await this.advanceToNextAddress();
                }
            }

            // Update display
            this.updateAddressDisplay();
        } catch (error) {
            // Error already handled
        } finally {
            this.isProcessingAction = false;
        }
    }

    async undo() {
        try {
            const result = await this.apiCall('/api/undo', 'POST');
            this.currentAddress = result.current_address;
            this.updateAddressDisplay();
            this.updateProgress();
            this.updateActiveMarker();
            this.scheduleLoadGeocodedPoints(0);
            this.loadAddressList();
        } catch (error) {
            // Error already handled
        }
    }

    async export() {
        try {
            window.location.href = '/api/export';
        } catch (error) {
            alert('Failed to export data');
        }
    }

    onKeyDown(e) {
        // Don't trigger shortcuts if user is typing in an input field
        const activeElement = document.activeElement;
        const isTyping = activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.tagName === 'SELECT' ||
            activeElement.isContentEditable
        );

        if (isTyping) {
            return; // Let the user type normally
        }

        switch(e.key) {
            case ' ':
                e.preventDefault();
                this.skip();
                break;
            case 'Tab':
                e.preventDefault();
                const searchBox = document.getElementById('searchBox');
                if (searchBox) {
                    searchBox.focus();
                    searchBox.select(); // Select any existing text for easy replacement
                }
                break;
        }
    }

    // Address List Methods

    toggleAddressList() {
        const content = document.getElementById('addressListContent');
        const icon = document.querySelector('.toggle-icon');

        // Check current state from DOM instead of tracking separately
        const isCurrentlyCollapsed = content.classList.contains('collapsed');

        if (isCurrentlyCollapsed) {
            // Expand
            content.classList.remove('collapsed');
            icon.classList.add('expanded');
            this.addressListExpanded = true;
        } else {
            // Collapse
            content.classList.add('collapsed');
            icon.classList.remove('expanded');
            this.addressListExpanded = false;
        }
    }

    scrollToCurrentAddress() {
        if (!this.currentAddress) return;

        // Find the row with the current address
        const currentRow = document.querySelector(`#addressTableBody tr[data-id="${this.currentAddress.id}"]`);
        if (currentRow) {
            // Scroll into view with smooth behavior
            currentRow.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'nearest'
            });
        }
    }

    async loadStreets() {
        try {
            const result = await this.apiCall('/api/streets');
            const select = document.getElementById('streetFilter');

            // Keep "All Streets" option
            select.innerHTML = '<option value="">All Streets</option>';

            result.streets.forEach(street => {
                const option = document.createElement('option');
                option.value = street;
                option.textContent = street;
                select.appendChild(option);
            });
        } catch (error) {
            // Error already handled
        }
    }

    async loadAddressList() {
        try {
            const params = new URLSearchParams({
                page: this.addressList.currentPage,
                per_page: this.addressList.perPage,
                sort_by: this.addressList.sortBy,
                sort_order: this.addressList.sortOrder
            });

            if (this.addressList.filterStatus) {
                params.append('filter_status', this.addressList.filterStatus);
            }

            if (this.addressList.filterStreet) {
                params.append('filter_street', this.addressList.filterStreet);
            }

            if (this.addressList.searchQuery) {
                params.append('search', this.addressList.searchQuery);
            }

            // Context-aware filtering based on active historical map
            if (this.currentHistoricalMap) {
                // When a map is active, show only addresses for that map + addresses not yet geocoded on any map
                params.append('filter_map', this.currentHistoricalMap);
                params.append('include_null', 'true');
            } else {
                // When no map is active, show deduplicated view (one entry per street/number)
                params.append('deduplicate', 'true');
            }

            const result = await this.apiCall(`/api/addresses?${params}`);

            this.addressList.totalPages = result.pages;
            this.addressList.total = result.total;
            this.addressList.currentPage = result.current_page;

            this.renderAddressTable(result.addresses);
            this.renderPagination();
            this.updateSortIndicators();

            // Auto-scroll to current address after a short delay to ensure DOM is updated
            setTimeout(() => this.scrollToCurrentAddress(), 100);
            return result;
        } catch (error) {
            // Error already handled
        }
    }

    renderAddressTable(addresses) {
        const tbody = document.getElementById('addressTableBody');

        // Store addresses for navigation
        this.currentPageAddresses = addresses;

        if (addresses.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="loading">No addresses found</td></tr>';
            return;
        }

        tbody.innerHTML = addresses.map(address => {
            const isCurrent = this.currentAddress && this.currentAddress.id === address.id;
            const statusClass = `status-${address.status}`;

            // Show multi-map indicator if address exists on multiple maps
            const mapCount = address.map_count || 0;
            const multiMapBadge = mapCount > 1 ? `<span class="multi-map-badge" title="Geocoded on ${mapCount} maps">• ${mapCount} maps</span>` : '';

            return `
                <tr class="${isCurrent ? 'current-address' : ''}" data-id="${address.id}">
                    <td>${this.escapeHtml(address.street)}</td>
                    <td>${this.escapeHtml(address.number)}</td>
                    <td><span class="status-badge ${statusClass}">${address.status}</span>${multiMapBadge}</td>
                </tr>
            `;
        }).join('');

        // Add click handlers to rows
        tbody.querySelectorAll('tr').forEach(row => {
            row.addEventListener('click', () => {
                const addressId = parseInt(row.dataset.id);
                this.selectAddress(addressId);
            });
        });
    }

    async jumpToFirstSearchResult(addresses) {
        const query = (this.addressList.searchQuery || '').trim().toLowerCase();

        if (!query || !addresses || addresses.length === 0) {
            return;
        }

        const streetMatches = addresses.filter(addr =>
            typeof addr.street === 'string' &&
            addr.street.toLowerCase().includes(query)
        );

        if (streetMatches.length === 0) {
            return;
        }

        const pendingMatch = streetMatches.find(addr => addr.status === 'pending');
        const target = pendingMatch || streetMatches[0];

        if (target) {
            await this.selectAddress(target.id, { reloadList: false });
        }
    }

    async selectAddress(addressId, options = {}) {
        if (typeof options === 'boolean') {
            options = { reloadList: options };
        }

        const {
            reloadList = true,
            focus = true
        } = options;

        try {
            const result = await this.apiCall('/api/set_current', 'POST', {
                address_id: addressId
            });

            this.currentAddress = result.address;
            this.updateAddressDisplay();

            const hasCoordinates =
                this.currentAddress &&
                this.isValidCoordinate(this.currentAddress.lat) &&
                this.isValidCoordinate(this.currentAddress.lon);
            const shouldFocusOnExistingPoint =
                focus &&
                this.currentAddress &&
                this.currentAddress.status === 'geocoded' &&
                hasCoordinates;

            if (reloadList) {
                await this.loadAddressList(); // Refresh to highlight new current address
                // Scroll happens automatically in loadAddressList()
            } else {
                // Just update the table highlighting without reloading
                this.renderAddressTable(this.currentPageAddresses);
                setTimeout(() => this.scrollToCurrentAddress(), 100);
            }

            this.updateActiveMarker();

            if (shouldFocusOnExistingPoint) {
                this.focusOnCoordinates(this.currentAddress.lat, this.currentAddress.lon, {
                    flash: true
                });
            }

            this.renderMarkers();
        } catch (error) {
            // Error already handled
        }
    }

    sortByColumn(column) {
        if (this.addressList.sortBy === column) {
            // Toggle sort order
            this.addressList.sortOrder = this.addressList.sortOrder === 'ASC' ? 'DESC' : 'ASC';
        } else {
            // New column, default to ASC
            this.addressList.sortBy = column;
            this.addressList.sortOrder = 'ASC';
        }

        this.addressList.currentPage = 1;
        this.loadAddressList();
    }

    updateSortIndicators() {
        // Clear all indicators
        document.querySelectorAll('.sort-indicator').forEach(indicator => {
            indicator.className = 'sort-indicator';
        });

        // Set active indicator
        const activeHeader = document.querySelector(`[data-sort="${this.addressList.sortBy}"]`);
        if (activeHeader) {
            const indicator = activeHeader.querySelector('.sort-indicator');
            indicator.classList.add(this.addressList.sortOrder.toLowerCase());
        }
    }

    goToPage(page) {
        if (page < 1 || page > this.addressList.totalPages) return;
        this.addressList.currentPage = page;
        this.loadAddressList();
    }

    renderPagination() {
        const currentPage = this.addressList.currentPage;
        const totalPages = this.addressList.totalPages;
        const perPage = this.addressList.perPage;
        const total = this.addressList.total;

        // Update info text
        const start = perPage > 0 ? ((currentPage - 1) * perPage + 1) : 1;
        const end = perPage > 0 ? Math.min(currentPage * perPage, total) : total;
        document.getElementById('paginationInfo').textContent =
            `Showing ${start}-${end} of ${total} addresses`;

        // Update button states
        document.getElementById('firstPageBtn').disabled = currentPage === 1;
        document.getElementById('prevPageBtn').disabled = currentPage === 1;
        document.getElementById('nextPageBtn').disabled = currentPage === totalPages || totalPages === 0;
        document.getElementById('lastPageBtn').disabled = currentPage === totalPages || totalPages === 0;

        // Render page numbers
        const pageNumbers = document.getElementById('pageNumbers');
        pageNumbers.innerHTML = this.generatePageNumbers(currentPage, totalPages);

        // Add click handlers to page numbers
        pageNumbers.querySelectorAll('.page-number').forEach(btn => {
            btn.addEventListener('click', () => {
                const page = parseInt(btn.dataset.page);
                this.goToPage(page);
            });
        });
    }

    generatePageNumbers(current, total) {
        if (total === 0) return '';

        const pages = [];
        const maxVisible = 5;

        if (total <= maxVisible) {
            // Show all pages
            for (let i = 1; i <= total; i++) {
                pages.push(this.createPageButton(i, current));
            }
        } else {
            // Show first, last, and pages around current
            pages.push(this.createPageButton(1, current));

            if (current > 3) {
                pages.push('<span class="page-ellipsis">...</span>');
            }

            const start = Math.max(2, current - 1);
            const end = Math.min(total - 1, current + 1);

            for (let i = start; i <= end; i++) {
                pages.push(this.createPageButton(i, current));
            }

            if (current < total - 2) {
                pages.push('<span class="page-ellipsis">...</span>');
            }

            pages.push(this.createPageButton(total, current));
        }

        return pages.join('');
    }

    createPageButton(page, current) {
        const active = page === current ? 'active' : '';
        return `<span class="page-number ${active}" data-page="${page}">${page}</span>`;
    }

    isValidCoordinate(value) {
        const num = Number(value);
        return Number.isFinite(num);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new GeocoderApp();
});
