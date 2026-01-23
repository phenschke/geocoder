#!/usr/bin/env python3
"""
Convert tile directories to MBTiles format for easier portability.

Usage:
    python convert_to_mbtiles.py                    # Convert all maps
    python convert_to_mbtiles.py 1880_Wenng         # Convert specific map
"""

import sys
import sqlite3
import time
import gc
from pathlib import Path
from mbutil import disk_to_mbtiles

# Configuration
MAPS_DIR = Path(__file__).parent.parent / "static" / "maps"
OUTPUT_DIR = MAPS_DIR  # Output MBTiles files directly in maps directory


def get_tile_bounds(tiles_dir):
    """Calculate the bounding box and zoom levels from tiles directory."""
    min_zoom = float('inf')
    max_zoom = 0
    min_x = float('inf')
    max_x = 0
    min_y = float('inf')
    max_y = 0

    tiles_path = Path(tiles_dir)

    # Walk through z/x/y.png structure
    for z_dir in tiles_path.iterdir():
        if not z_dir.is_dir():
            continue

        try:
            z = int(z_dir.name)
            min_zoom = min(min_zoom, z)
            max_zoom = max(max_zoom, z)

            for x_dir in z_dir.iterdir():
                if not x_dir.is_dir():
                    continue

                x = int(x_dir.name)
                min_x = min(min_x, x)
                max_x = max(max_x, x)

                for y_file in x_dir.iterdir():
                    if y_file.suffix == '.png':
                        y = int(y_file.stem)
                        min_y = min(min_y, y)
                        max_y = max(max_y, y)
        except ValueError:
            continue

    return {
        'minzoom': min_zoom if min_zoom != float('inf') else 0,
        'maxzoom': max_zoom,
        'bounds': f"{min_x},{min_y},{max_x},{max_y}" if min_x != float('inf') else None
    }


def flip_y_coordinates(mbtiles_path, max_retries=5):
    """Convert tile_row from XYZ to TMS coordinate scheme.

    gdal2tiles --xyz creates XYZ-named tiles, but Leaflet with tms:true
    expects TMS coordinates. This flips Y: tms_y = (2^zoom - 1) - xyz_y
    """
    for attempt in range(max_retries):
        try:
            conn = sqlite3.connect(mbtiles_path, timeout=60.0)
            cursor = conn.cursor()

            # Get all zoom levels
            cursor.execute('SELECT DISTINCT zoom_level FROM tiles')
            zoom_levels = [row[0] for row in cursor.fetchall()]

            for zoom in zoom_levels:
                max_y = (2 ** zoom) - 1
                cursor.execute(
                    'UPDATE tiles SET tile_row = ? - tile_row WHERE zoom_level = ?',
                    (max_y, zoom)
                )

            conn.commit()
            conn.close()
            return
        except sqlite3.OperationalError as e:
            if "locked" in str(e) and attempt < max_retries - 1:
                wait_time = (attempt + 1) * 2
                print(f"   Database locked during Y-flip, retrying in {wait_time}s...")
                time.sleep(wait_time)
                gc.collect()
            else:
                raise


def add_metadata(mbtiles_path, map_name, tiles_dir, max_retries=5):
    """Add metadata to MBTiles file with retry logic for locked database."""
    bounds_info = get_tile_bounds(tiles_dir)

    metadata = {
        'name': map_name,
        'type': 'baselayer',
        'version': '1.0.0',
        'description': f'Historical map tiles for {map_name}',
        'format': 'png',
        'minzoom': str(bounds_info['minzoom']),
        'maxzoom': str(bounds_info['maxzoom']),
    }

    if bounds_info['bounds']:
        metadata['bounds'] = bounds_info['bounds']

    for attempt in range(max_retries):
        try:
            conn = sqlite3.connect(mbtiles_path, timeout=60.0, isolation_level='DEFERRED')
            cursor = conn.cursor()

            for key, value in metadata.items():
                cursor.execute(
                    'INSERT OR REPLACE INTO metadata (name, value) VALUES (?, ?)',
                    (key, value)
                )

            conn.commit()
            conn.close()
            return  # Success
        except sqlite3.OperationalError as e:
            if "locked" in str(e) and attempt < max_retries - 1:
                wait_time = (attempt + 1) * 2  # 2, 4, 6, 8 seconds
                print(f"   Database locked, retrying in {wait_time}s... (attempt {attempt + 1}/{max_retries})")
                time.sleep(wait_time)
                gc.collect()  # Force garbage collection to release any lingering connections
            else:
                raise


def convert_map(map_name):
    """Convert a single map from tiles to MBTiles."""
    tiles_dir = MAPS_DIR / map_name / "tiles"

    if not tiles_dir.exists():
        print(f"❌ Tiles directory not found: {tiles_dir}")
        return False

    # Count tiles
    tile_count = sum(1 for _ in tiles_dir.rglob("*.png"))
    if tile_count == 0:
        print(f"❌ No tiles found in {tiles_dir}")
        return False

    print(f"📊 Converting {map_name}: {tile_count:,} tiles")

    # Create output directory
    OUTPUT_DIR.mkdir(exist_ok=True)

    # Output path
    mbtiles_path = OUTPUT_DIR / f"{map_name}.mbtiles"

    # Remove existing file
    if mbtiles_path.exists():
        print(f"   Removing existing {mbtiles_path.name}")
        mbtiles_path.unlink()

    # Convert
    start_time = time.time()

    try:
        # mbutil expects string paths
        disk_to_mbtiles(str(tiles_dir), str(mbtiles_path), format='png', scheme='tms')

        # Force garbage collection to release mbutil's database connection
        gc.collect()
        time.sleep(1)

        # Flip Y coordinates from XYZ to TMS (gdal2tiles --xyz creates XYZ tiles)
        print("   Flipping Y coordinates to TMS scheme...")
        flip_y_coordinates(str(mbtiles_path))

        # Add metadata (with retry logic for locked database)
        add_metadata(str(mbtiles_path), map_name, tiles_dir)

        elapsed = time.time() - start_time
        file_size = mbtiles_path.stat().st_size / (1024 * 1024)  # MB

        print(f"✅ Completed in {elapsed:.1f}s")
        print(f"   Output: {mbtiles_path.name} ({file_size:.1f} MB)")
        print(f"   Speed: {tile_count / elapsed:.0f} tiles/sec\n")

        return True

    except Exception as e:
        print(f"❌ Error converting {map_name}: {e}\n")
        return False


def main():
    """Main conversion function."""
    print("🗺️  MBTiles Converter\n")

    # Get list of maps to convert
    if len(sys.argv) > 1:
        # Specific map requested
        maps_to_convert = [sys.argv[1]]
    else:
        # Find all maps with tiles directories
        maps_to_convert = [
            d.name for d in MAPS_DIR.iterdir()
            if d.is_dir() and (d / "tiles").exists() and d.name != ".gitkeep"
        ]

    if not maps_to_convert:
        print("❌ No maps found to convert")
        print(f"   Looking in: {MAPS_DIR}")
        return 1

    print(f"Found {len(maps_to_convert)} map(s) to convert:\n")

    # Convert each map
    total_start = time.time()
    successful = 0

    for map_name in sorted(maps_to_convert):
        if convert_map(map_name):
            successful += 1

    # Summary
    total_elapsed = time.time() - total_start
    print("=" * 60)
    print(f"✅ Converted {successful}/{len(maps_to_convert)} maps in {total_elapsed:.1f}s")
    print(f"📁 Output directory: {OUTPUT_DIR}")

    return 0 if successful == len(maps_to_convert) else 1


if __name__ == "__main__":
    sys.exit(main())
