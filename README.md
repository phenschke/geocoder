# Historical Map Geocoder

A tool for geocoding historical addresses by clicking on a map. Flask + Vanilla JS.

## Quick Start

### 1. Installation

This project uses [uv](https://github.com/astral-sh/uv) for fast dependency management.

#### Linux/Mac

```bash
# Run the startup script (installs uv and dependencies automatically)
./run.sh
```

The script will:
- Install uv if not already installed
- Install all dependencies
- Create necessary directories
- Start the server at http://localhost:5000

#### Windows

```cmd
# Run the startup script (installs uv and dependencies automatically)
run.bat
```

The script will:
- Install uv if not already installed
- Install all dependencies
- Create necessary directories
- Start the server at http://localhost:5000

#### Manual Installation (Optional)

If you prefer to install manually:

**Linux/Mac:**
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
uv sync
uv run python app.py
```

**Windows (PowerShell):**
```powershell
irm https://astral.sh/uv/install.ps1 | iex
uv sync
uv run python app.py
```

### 2. Prepare Your Data

#### Map Preparation

Place your historical map image(s) in the `static/maps/` directory:
```bash
cp your_historical_map.png static/maps/
```

**For optimal performance with large georeferenced maps**, pre-generate tiles using GDAL:

```bash
# Install GDAL (if not already installed)
# Ubuntu/Debian: sudo apt-get install gdal-bin
# macOS: brew install gdal
# Windows: Download from https://gdal.org/download.html

# Place your georeferenced TIFF in static/maps/
cp your_map.tif static/maps/YourMapName.tif

# OPTIONAL BUT RECOMMENDED: Add internal overviews for 50-70% faster tiling
gdaladdo -r average static/maps/YourMapName.tif 2 4 8 16 32 64 128

# Create tile directory
mkdir -p static/maps/YourMapName_Georef/tiles

# Generate tiles (adjust --processes to match your CPU cores)
# IMPORTANT: Use --xyz flag for correct coordinate scheme
gdal2tiles.py -z 13-20 \
  --processes=4 \
  --xyz \
  --resampling=average \
  static/maps/YourMapName.tif \
  static/maps/YourMapName_Georef/tiles/

# Convert tiles to MBTiles format (single file, more efficient)
uv run python scripts/convert_to_mbtiles.py YourMapName_Georef

# OPTIONAL: Clean up tile directory to save disk space
rm -rf static/maps/YourMapName_Georef/tiles/
```

**Performance comparison:**
- **With tiles**: Map loads instantly, smooth panning at all zoom levels
- **Without tiles**: 30-60 second load time, laggy panning, high memory usage

#### Address Data

Create a CSV file with your addresses. The CSV should have at least two columns:
- Street name
- House number

Example (`addresses.csv`):
```csv
street,number
Main Street,1
Main Street,2
Oak Avenue,15
Oak Avenue,17
```

### 3. Run the Application

**Linux/Mac:**
```bash
./run.sh
```

**Windows:**
```cmd
run.bat
```

The server will start automatically. Open your browser to: `http://localhost:5000`

### 4. Geocoding Workflow

1. **Import your addresses**:
   - Click the `Addresses CSV` chooser and select your file
   - In the preview modal, pick the street and number columns (auto-detected when possible)
   - If your CSV already has latitude/longitude, enable **Import existing geocoding** and choose those columns
   - Confirm the import to load addresses into the queue

2. **Load your map**:
   - Select a map from the dropdown
   - Click "Load Map"

3. **Start geocoding**:
   - The first address appears in the sidebar
   - Navigate the map using click-and-drag
   - Zoom with mouse wheel or +/- buttons
   - **Right-click** on the location of the current address
   - The tool automatically advances to the next address

4. **Use shortcuts for speed**:
   - **Right-click** = Geocode current address
   - **Space** = Skip/mark as uncertain
   - **Z** = Undo last action
   - **Mouse wheel** = Zoom in/out
   - **Click + Drag** = Pan the map

5. **Export results**:
   - Click "Export CSV" to download geocoded addresses
   - Output includes: street, number, x, y coordinates, status, timestamp

## Controls Reference

### Mouse Controls
- **Left-click + drag**: Pan the map
- **Right-click**: Geocode current address at clicked location
- **Mouse wheel**: Zoom in/out

### Keyboard Shortcuts
- **Space**: Skip current address
- **Z**: Undo last action
- **+/-**: Zoom in/out

### Buttons
- **Undo**: Revert last geocode or skip action
- **Skip**: Mark current address as uncertain/skipped
- **Export CSV**: Download results as CSV file
- **Reset View**: Reset map to original zoom and position

## Data Storage

All data is stored in SQLite database at `data/geocoder.db`:
- **addresses**: Main table with street, number, coordinates, status
- **undo_history**: Stack of last 50 actions for undo functionality

The tool auto-saves after each click, so you can work in sessions and resume anytime.

## CSV Format

### Input CSV
Minimum required columns:
- Street name (auto-detects: street, Street, street_name, StreetName, address)
- House number (auto-detects: number, Number, house_number, HouseNumber, num, no)

### Output CSV
Exported file includes:
- `street`: Street name
- `number`: House number
- `x_coord`: X pixel coordinate on map
- `y_coord`: Y pixel coordinate on map
- `lat`: Latitude (null unless georeferenced)
- `lon`: Longitude (null unless georeferenced)
- `status`: geocoded, skipped, or pending
- `timestamp`: When the address was processed
