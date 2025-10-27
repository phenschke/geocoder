# Historical Address Geocoder - Technical Specification

## Project Overview

A Flask-based web application for manually geocoding historical addresses by clicking on georeferenced historical maps. The tool enables researchers to assign geographic coordinates to addresses by viewing historical maps and selecting building locations.

### Design Goals

- **Street-oriented workflow**: Geocode addresses street-by-street for efficiency
- **Dynamic numbering**: House numbers are generated sequentially as the user geocodes (no predefined address list)
- **Map flexibility**: Support multiple historical map overlays with adjustable opacity
- **Performance**: Handle 5,000+ streets with responsive UI
- **Simplicity**: Minimal clicks, keyboard shortcuts, intuitive interface

### Use Case

Historical researchers need to geocode addresses from historical documents. Since historical address lists rarely contain complete house number sequences, this tool allows users to:

1. Upload a list of streets to geocode
2. Select a street and view it on a historical map
3. Click buildings sequentially to assign coordinates
4. Let house numbers auto-increment (starting from 1)
5. Skip missing/demolished buildings
6. Export geocoded results as CSV

## Technology Stack

- **Backend**: Flask (Python 3.11+)
- **Frontend**: Leaflet.js + vanilla JavaScript
- **Database**: SQLite
- **Package Manager**: uv (fast Python package management)
- **Map Format**: Tiled maps (gdal2tiles.py output format)
- **Deployment**: Local development server (localhost:5000)

## Map Display System

### Map Framework

The application uses Leaflet.js for an interactive map interface with the following layers:

#### Base Layers (Radio Selection)

Two mutually exclusive base layers:

1. **OpenStreetMap**: Modern street map from OpenStreetMap contributors
2. **Satellite**: Aerial imagery from Esri World Imagery

Users can switch between base layers via Leaflet's layer control.

#### Historical Map Overlays (Radio Selection)

Historical maps are loaded as tiled overlays. Only one historical map can be active at a time (radio button behavior).

**Map Source**: Tiled maps stored in `maps/*/tiles/` directories

**Format**: gdal2tiles.py output (TMS format)
- `tiles/{z}/{x}/{y}.png` - tile images
- `tiles/tilemapresource.xml` - metadata (bounds, zoom levels)

**Auto-discovery**: On startup, the application scans `maps/` for subdirectories containing `tiles/tilemapresource.xml` and automatically adds them to the overlay selection.

**Example directory structure**:
```
maps/
├── 1908_munich_map/
│   ├── source.tif          (optional, not loaded)
│   └── tiles/
│       ├── tilemapresource.xml
│       └── {z}/{x}/{y}.png
└── 1920_munich_map/
    └── tiles/
        ├── tilemapresource.xml
        └── {z}/{x}/{y}.png
```

### Opacity Control

When a historical map overlay is active, an opacity slider appears in the top-right corner of the map.

- **Range**: 0% (transparent) to 100% (opaque)
- **Default**: 100%
- **Behavior**: Adjusts opacity of the currently active historical overlay
- **UI**: Leaflet custom control with range slider

### Map Interactions

- **Pan**: Click and drag
- **Zoom**: Mouse wheel or zoom controls
- **Right-click**: Geocode current address at clicked location
- **Left-click on marker**: Select/view address info
- **Drag marker**: Adjust geocoded position (at high zoom levels only)

### Coordinate Display

A small info box at the bottom of the map displays the current mouse coordinates (latitude/longitude) as the user moves the cursor.

## User Workflow

### 1. Street List Import

The user uploads a CSV file containing street names.

**CSV Format**:
```csv
street
Leopoldstraße
Ludwigstraße
Maximilianstraße
```

**Column Detection**: Auto-detect common column names (`street`, `Street`, `street_name`, `StreetName`)

**Import Behavior**:
- Clear existing street list
- Import unique street names
- Initialize street state (current house number = 1 for each street)
- Display first street alphabetically

### 2. Street Selection

The user selects a street to geocode from a performant dropdown.

**Dropdown Design** (optimized for 5,000+ streets):
- HTML `<select>` with native browser search
- Type to filter/jump to street
- Alphabetically sorted
- Optionally: Virtual scrolling or autocomplete for better UX

**Selection Behavior**:
- Pressing Enter or selecting from dropdown sets the active street
- Current house number for that street is displayed
- If street was previously worked on, resume at saved house number
- Map doesn't auto-zoom (user manually navigates)

### 3. Geocoding Addresses

The user geocodes addresses by right-clicking on building locations.

**Active Address Display**:
```
Current Address:
Leopoldstraße
15
```

**Right-click Action**:
1. Capture clicked coordinates (lat/lon)
2. Save to database: `(Leopoldstraße, 15, lat, lon, timestamp)`
3. Increment house number to 16
4. Display geocoded marker on map
5. Update UI to show new current number

**Marker Visualization**:
- Colored circle markers (color based on street name hash)
- Display house number inside marker
- Recent markers (last 5) slightly larger
- All markers for active street highlighted

### 4. Skipping Addresses

Press **Space** to skip an address (e.g., missing/demolished building).

**Skip Action**:
1. Record skip in database: `(Leopoldstraße, 15, NULL, NULL, timestamp, status='skipped')`
2. Increment house number to 16
3. Update UI

**Use Case**: Building #15 doesn't exist or is illegible on the map.

### 5. Undo

Press **Z** to undo the last action.

**Undo Behavior**:
1. Remove last geocoded or skipped entry from database
2. Decrement house number by 1
3. Update UI
4. Remove marker from map (if geocoded)

**Undo Stack**: Last 50 actions (configurable)

### 6. Street Switching

The user can switch streets at any time.

**Multi-street Support**:
- Each street maintains its own state (current house number)
- Switching to "Ludwigstraße" shows its saved house number
- All geocoded markers remain visible on map
- No restriction on switching frequency

**Example Session**:
1. Geocode Leopoldstraße 1-10
2. Switch to Ludwigstraße (starts at 1)
3. Geocode Ludwigstraße 1-5
4. Switch back to Leopoldstraße (resumes at 11)
5. Continue geocoding

### 7. Progress Tracking

The sidebar displays real-time statistics:
- **Total Streets**: Number of streets imported
- **Streets Started**: Number of streets with at least one geocoded address
- **Total Geocoded**: Total number of geocoded addresses
- **Total Skipped**: Total number of skipped addresses

### 8. Export

Click **Export CSV** to download geocoded results.

**Export Format**:
```csv
street,number,lat,lon,status,timestamp
Leopoldstraße,1,48.1351,11.5820,geocoded,2025-01-15T10:30:00
Leopoldstraße,2,48.1352,11.5821,geocoded,2025-01-15T10:30:15
Leopoldstraße,3,,,skipped,2025-01-15T10:30:20
```

## Data Model

### Database Schema

#### `streets` Table

Stores the list of streets to geocode.

```sql
CREATE TABLE streets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL
);
```

#### `street_state` Table

Tracks the current house number for each street (multi-street session support).

```sql
CREATE TABLE street_state (
    street_id INTEGER PRIMARY KEY,
    current_number INTEGER NOT NULL DEFAULT 1,
    last_updated TEXT NOT NULL,
    FOREIGN KEY (street_id) REFERENCES streets(id)
);
```

#### `geocoded_addresses` Table

Stores all geocoded and skipped addresses.

```sql
CREATE TABLE geocoded_addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    street_id INTEGER NOT NULL,
    number INTEGER NOT NULL,
    lat REAL,
    lon REAL,
    status TEXT NOT NULL,  -- 'geocoded' or 'skipped'
    timestamp TEXT NOT NULL,
    UNIQUE(street_id, number),
    FOREIGN KEY (street_id) REFERENCES streets(id)
);
```

#### `undo_history` Table

Tracks the last N actions for undo functionality.

```sql
CREATE TABLE undo_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_type TEXT NOT NULL,  -- 'geocode' or 'skip'
    street_id INTEGER NOT NULL,
    number INTEGER NOT NULL,
    lat REAL,
    lon REAL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (street_id) REFERENCES streets(id)
);
```

**Undo Stack Size**: Configurable (default: 50 actions)

### Data Operations

#### Import Streets

```python
def import_streets(csv_data: str, street_column: str) -> int:
    """
    Import streets from CSV.
    Clears existing data and resets all state.
    Returns number of streets imported.
    """
    # Clear all tables
    # Parse CSV
    # Insert unique street names
    # Initialize street_state for each street (current_number=1)
    # Return count
```

#### Get Current Street State

```python
def get_street_state(street_id: int) -> dict:
    """
    Returns {
        'street_id': int,
        'street_name': str,
        'current_number': int
    }
    """
```

#### Geocode Address

```python
def geocode_address(street_id: int, number: int, lat: float, lon: float) -> bool:
    """
    1. Save to undo_history
    2. Insert into geocoded_addresses (status='geocoded')
    3. Increment street_state.current_number
    4. Prune old undo_history entries
    """
```

#### Skip Address

```python
def skip_address(street_id: int, number: int) -> bool:
    """
    1. Save to undo_history
    2. Insert into geocoded_addresses (status='skipped', lat=NULL, lon=NULL)
    3. Increment street_state.current_number
    4. Prune old undo_history entries
    """
```

#### Undo Last Action

```python
def undo_last_action() -> dict:
    """
    1. Get most recent undo_history entry
    2. Delete corresponding geocoded_addresses entry
    3. Decrement street_state.current_number for that street
    4. Delete undo_history entry
    5. Return updated street state
    """
```

## API Endpoints

### Street Management

#### `POST /api/import`

Import streets from CSV data.

**Request**:
```json
{
    "csv_data": "street\nLeopoldstraße\nLudwigstraße",
    "street_column": "street"
}
```

**Response**:
```json
{
    "success": true,
    "imported": 2,
    "message": "Imported 2 streets"
}
```

#### `GET /api/streets`

Get list of all streets (for dropdown population).

**Response**:
```json
{
    "success": true,
    "streets": [
        {"id": 1, "name": "Leopoldstraße"},
        {"id": 2, "name": "Ludwigstraße"}
    ]
}
```

#### `GET /api/street/<street_id>`

Get current state for a specific street.

**Response**:
```json
{
    "success": true,
    "street": {
        "id": 1,
        "name": "Leopoldstraße",
        "current_number": 15
    }
}
```

#### `POST /api/select_street`

Select a street as the active street.

**Request**:
```json
{
    "street_id": 1
}
```

**Response**:
```json
{
    "success": true,
    "street": {
        "id": 1,
        "name": "Leopoldstraße",
        "current_number": 15
    }
}
```

### Geocoding Actions

#### `POST /api/geocode`

Geocode the current address.

**Request**:
```json
{
    "street_id": 1,
    "number": 15,
    "lat": 48.1351,
    "lon": 11.5820
}
```

**Response**:
```json
{
    "success": true,
    "new_number": 16
}
```

#### `POST /api/skip`

Skip the current address.

**Request**:
```json
{
    "street_id": 1,
    "number": 15
}
```

**Response**:
```json
{
    "success": true,
    "new_number": 16
}
```

#### `POST /api/undo`

Undo the last action.

**Response**:
```json
{
    "success": true,
    "restored_state": {
        "street_id": 1,
        "street_name": "Leopoldstraße",
        "current_number": 15
    }
}
```

### Map Data

#### `GET /api/maps`

List available tiled maps.

**Response**:
```json
{
    "success": true,
    "maps": [
        {"name": "1908 Munich Map", "path": "1908_munich_map"},
        {"name": "1920 Munich Map", "path": "1920_munich_map"}
    ]
}
```

#### `GET /api/points`

Get geocoded points for map display (all streets or filtered by bounds).

**Query Parameters**:
- `min_lat`, `max_lat`, `min_lon`, `max_lon` (optional): Bounding box filter

**Response**:
```json
{
    "success": true,
    "points": [
        {
            "id": 1,
            "street": "Leopoldstraße",
            "number": 1,
            "lat": 48.1351,
            "lon": 11.5820
        }
    ]
}
```

### Statistics & Export

#### `GET /api/stats`

Get geocoding statistics.

**Response**:
```json
{
    "success": true,
    "stats": {
        "total_streets": 100,
        "streets_started": 25,
        "total_geocoded": 450,
        "total_skipped": 23
    }
}
```

#### `GET /api/export`

Export geocoded addresses as CSV download.

**Response**: CSV file download

## Frontend Components

### Map Viewer (`map-container`)

Leaflet map instance with:
- Base layer control (OSM/Satellite)
- Historical map radio selection
- Opacity slider (appears when overlay active)
- Coordinate display
- Right-click handler for geocoding
- Marker rendering (canvas-based for performance)

### Street Selector (`street-selector`)

Dropdown/input for selecting active street:
- `<select>` element with all streets
- Native browser search/filter
- Current selection highlighted
- Shows street name only

### Current Address Display (`current-address`)

Large, prominent display showing:
```
Current Address:
[Street Name]
[House Number]
```

Updated in real-time as actions occur.

### Action Buttons

- **Skip (Space)**: Skip current address
- **Undo (Z)**: Undo last action
- **Export CSV**: Download results

### Progress Statistics

Sidebar panel showing:
- Total streets
- Streets started
- Total geocoded
- Total skipped

### Import Modal

Modal dialog for CSV import:
- File upload
- Column selection (street column)
- Preview table
- Import confirmation

## Performance Considerations

### 5,000+ Street Dropdown

**Challenge**: Rendering 5,000 options in a dropdown can cause UI lag.

**Solutions**:
1. **Native `<select>` with browser optimization**: Modern browsers handle large `<select>` elements well with native search
2. **Virtual scrolling**: Render only visible options (if using custom dropdown)
3. **Autocomplete/filter**: Show filtered subset based on user input
4. **Lazy loading**: Load streets in batches as user scrolls

**Recommendation**: Start with native `<select>` (simplest), optimize later if needed.

### Marker Rendering

**Challenge**: Displaying hundreds/thousands of geocoded markers.

**Solution**: Canvas-based marker layer (Leaflet.CanvasMarkers plugin)
- Hardware-accelerated rendering
- Supports thousands of markers
- Faster than SVG markers

### Database Queries

**Indexes**:
```sql
CREATE INDEX idx_geocoded_street ON geocoded_addresses(street_id);
CREATE INDEX idx_geocoded_status ON geocoded_addresses(status);
CREATE INDEX idx_undo_timestamp ON undo_history(timestamp DESC);
```

## Configuration

Centralized configuration in `config.py`:

```python
class Config:
    # Database
    DATABASE_PATH = 'data/geocoder.db'

    # Maps
    MAPS_DIR = 'static/maps'

    # Undo stack size
    UNDO_STACK_SIZE = 50

    # Default map center (Munich)
    DEFAULT_CENTER = [48.1351, 11.5820]
    DEFAULT_ZOOM = 13
```

## File Structure

```
geocoder/
├── app.py                          # Flask application and API routes
├── database.py                     # SQLite database layer
├── config.py                       # Configuration constants
├── pyproject.toml                  # uv dependencies
├── run.sh                          # Startup script (uv sync && uv run python app.py)
├── SPECIFICATION.md                # This document
├── data/
│   └── geocoder.db                 # SQLite database (auto-created)
├── static/
│   ├── maps/                       # Historical map tiles
│   │   ├── 1908_munich_map/
│   │   │   └── tiles/
│   │   │       ├── tilemapresource.xml
│   │   │       └── {z}/{x}/{y}.png
│   │   └── 1920_munich_map/
│   │       └── tiles/
│   ├── css/
│   │   └── style.css               # UI styling
│   └── js/
│       ├── app.js                  # Main application logic
│       └── vendor/
│           └── leaflet.canvas-markers.js
├── templates/
│   └── index.html                  # Single-page application template
└── sample_streets.csv              # Example street list
```

## Development Commands

### Starting the Application

```bash
# Recommended: Use startup script
./run.sh

# Or manually
uv sync                  # Install dependencies
uv run python app.py     # Run application
```

Server runs at `http://localhost:5000`

### Creating Tiled Maps

Convert georeferenced TIFF to tiles:

```bash
gdal2tiles.py -z 13-20 source.tif maps/my_map/tiles/
```

This creates a `tiles/` directory with TMS format tiles.

## Future Enhancements

Potential features for future versions:

1. **Smart numbering**: Detect even/odd patterns (European style: even on one side, odd on other)
2. **Bulk operations**: Geocode multiple addresses in one click (e.g., apartment building)
3. **Address search**: Search for already-geocoded addresses
4. **Street completion indicator**: Visual progress per street
5. **Collaborative mode**: Multiple users geocoding different streets
6. **Machine learning assist**: Auto-suggest building locations based on map features
7. **Export to GeoJSON**: For GIS software integration
8. **Import from other formats**: Support Shapefile, GeoJSON imports

## Testing Checklist

Before deployment, verify:

- [ ] Street import works with various CSV formats
- [ ] Geocoding increments house numbers correctly
- [ ] Skip increments house numbers correctly
- [ ] Undo decrements house numbers and removes points
- [ ] Street switching preserves individual street states
- [ ] Tiled maps load and display correctly
- [ ] Opacity slider adjusts overlay transparency
- [ ] Base layer switching works (OSM ↔ Satellite)
- [ ] Markers render correctly (colors, numbers, sizes)
- [ ] Export generates valid CSV
- [ ] Performance acceptable with 5,000+ streets
- [ ] Performance acceptable with 1,000+ markers
- [ ] Keyboard shortcuts work (Space, Z)
- [ ] Mobile/tablet layout responsive (optional)

## Known Limitations

1. **Single-user only**: SQLite doesn't support concurrent multi-user access well
2. **No authentication**: Anyone with localhost access can use the app
3. **Tiled maps only**: No support for raw GeoTIFF overlays (must pre-process with gdal2tiles)
4. **Linear numbering only**: Assumes sequential house numbers (no European even/odd patterns)
5. **Browser requirements**: Modern browser with Canvas and ES6 support required

## License & Attribution

- **Leaflet**: BSD 2-Clause License
- **OpenStreetMap**: © OpenStreetMap contributors, ODbL
- **Esri Satellite**: © Esri (terms of use apply)
- **Historical maps**: User must ensure they have rights to use their maps

---

**Document Version**: 1.0
**Last Updated**: 2025-01-27
**Author**: Project Team
