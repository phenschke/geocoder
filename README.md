# Historical Map Geocoder

A fast, interactive tool for geocoding historical addresses by clicking on rasterized maps. Built with Flask and vanilla JavaScript.

## Features

- **Interactive Map Viewer**: Pan, zoom, and navigate historical maps with ease
- **Right-click Geocoding**: Simple right-click to mark address locations
- **Undo/Redo**: Easily correct mistakes with full undo support (last 50 actions)
- **Skip Uncertain Addresses**: Mark addresses for later review
- **Progress Tracking**: Real-time progress bar and statistics
- **CSV Import/Export**: Import address lists and export geocoded results
- **Keyboard Shortcuts**: Speed up workflow with keyboard controls
- **Auto-advance**: Automatically moves to next address after geocoding

## Quick Start

### 1. Installation

This project uses [uv](https://github.com/astral-sh/uv) for fast dependency management.

```bash
# Install uv (if not already installed)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies (uv handles everything automatically)
uv sync
```

Or use the startup script which does everything for you:
```bash
./run.sh
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

# Create a subdirectory for your map
mkdir -p static/maps/YourMapName_Georef

# Move your georeferenced TIFF into it
mv your_map.tif static/maps/YourMapName_Georef/

# Generate tiles (this may take several minutes for large maps)
gdal2tiles.py -z 13-20 \
  static/maps/YourMapName_Georef/your_map.tif \
  static/maps/YourMapName_Georef/tiles/
```

**Performance comparison:**
- **With tiles**: Map loads instantly, smooth panning at all zoom levels
- **Without tiles**: 30-60 second load time, laggy panning, high memory usage

**Note**: Small PNG/JPG maps (<50MB) don't need tiling. GeoTIFF files should always be tiled for best performance.

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

```bash
# Using the startup script (recommended)
./run.sh

# Or manually with uv
uv run python app.py
```

Open your browser to: `http://localhost:5000`

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

## Performance Tips

1. **Organize your addresses**: Pre-sort your CSV by geographic location to minimize map panning
2. **Use keyboard shortcuts**: Space and Z keys are much faster than clicking buttons
3. **Adjust zoom once**: Find a comfortable zoom level and stick to it
4. **Enable auto-save**: Progress is automatically saved after each action

## Estimated Performance

Based on your estimate:
- **15 seconds per address** (including time to pan/click)
- **5,000 addresses** = ~21 hours of work
- With practice, you can likely get faster (10-12 seconds per address)

The tool auto-saves after each click, so you can work in sessions and resume anytime.

## Troubleshooting

**Map won't load or loads very slowly**:
- Ensure image is in `static/maps/` directory
- Check that file format is .png, .jpg, .jpeg, .tiff, or .tif
- Verify file isn't corrupted
- **For GeoTIFF files**: Pre-generate tiles using `gdal2tiles.py` (see Map Preparation section)
- If using tiles, check that `tiles/tilemapresource.xml` exists in the map directory

**Map selector shows no maps**:
- Check that files are directly in `static/maps/` or in subdirectories
- Files in `tiles/` subdirectories are automatically excluded from the dropdown

**CSV import fails**:
- Check that CSV path is absolute (e.g., `/home/user/data/addresses.csv`)
- Verify CSV has at least 2 columns
- Try specifying column names manually

**Points don't appear after geocoding**:
- Points appear as colored dots on the map (different colors per street)
- Recent points (last 5) have a larger size and shadow
- Refresh the page if points don't show
- Check browser console (F12) for errors

## Future Enhancements

Potential additions:
- Georeferencing support (convert pixel coordinates to lat/lon)
- Multiple map tiles/layers
- Address search/jump to
- Batch import from database
- Real-time collaboration (multiple users)
- Heat map visualization of geocoded density

## License

MIT License - feel free to modify and use for your research!
