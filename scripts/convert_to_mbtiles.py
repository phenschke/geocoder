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
from pathlib import Path
from mbutil import disk_to_mbtiles

# Configuration
MAPS_DIR = Path(__file__).parent / "static" / "maps"
OUTPUT_DIR = Path(__file__).parent / "static" / "mbtiles"


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


def add_metadata(mbtiles_path, map_name, tiles_dir):
    """Add metadata to MBTiles file."""
    bounds_info = get_tile_bounds(tiles_dir)

    conn = sqlite3.connect(mbtiles_path)
    cursor = conn.cursor()

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

    for key, value in metadata.items():
        cursor.execute(
            'INSERT OR REPLACE INTO metadata (name, value) VALUES (?, ?)',
            (key, value)
        )

    conn.commit()
    conn.close()


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

        # Add metadata
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
