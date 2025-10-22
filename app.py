from flask import Flask, render_template, request, jsonify, send_file
import os
from config import Config
from database import Database

app = Flask(__name__)
app.config.from_object(Config)

# Initialize database
db = Database()


@app.route('/')
def index():
    """Render main geocoding interface"""
    return render_template('index.html')


@app.route('/api/import', methods=['POST'])
def import_csv():
    """Import addresses from CSV file path"""
    try:
        data = request.json
        csv_path = data.get('csv_path')
        street_col = data.get('street_column')
        number_col = data.get('number_column')
        lat_col = data.get('lat_column')
        lon_col = data.get('lon_column')

        if not csv_path or not os.path.exists(csv_path):
            return jsonify({'error': 'CSV file not found'}), 400

        count = db.import_csv(csv_path, street_col, number_col, lat_col, lon_col)
        return jsonify({
            'success': True,
            'imported': count,
            'message': f'Imported {count} addresses'
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/import_data', methods=['POST'])
def import_csv_data():
    """Import addresses from CSV data sent from browser"""
    try:
        data = request.json
        csv_data = data.get('csv_data')
        street_col = data.get('street_column')
        number_col = data.get('number_column')
        lat_col = data.get('lat_column')
        lon_col = data.get('lon_column')

        if not csv_data:
            return jsonify({'error': 'No CSV data provided'}), 400

        count = db.import_csv_data(csv_data, street_col, number_col, lat_col, lon_col)
        return jsonify({
            'success': True,
            'imported': count,
            'message': f'Imported {count} addresses'
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/current', methods=['GET'])
def get_current():
    """Get current address to geocode with optional proximity-based ordering"""
    try:
        # Get viewport position from query parameters (optional)
        # Supports both pixel coordinates (x, y) and lat/lon
        current_x = request.args.get('viewport_x', type=float)
        current_y = request.args.get('viewport_y', type=float)
        current_lat = request.args.get('viewport_lat', type=float)
        current_lon = request.args.get('viewport_lon', type=float)
        last_street = request.args.get('last_street', type=str)

        address = db.get_current_address(current_x, current_y, current_lat, current_lon, last_street)

        if not address:
            return jsonify({
                'address': None,
                'message': 'No more addresses to geocode!'
            })

        return jsonify({
            'address': address,
            'success': True
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/geocode', methods=['POST'])
def geocode():
    """Save geocoded coordinates for current address"""
    try:
        data = request.json
        address_id = data.get('address_id')
        x = data.get('x')
        y = data.get('y')
        lat = data.get('lat')
        lon = data.get('lon')

        # Require address_id and either (x, y) or (lat, lon)
        if address_id is None:
            return jsonify({'error': 'Missing address_id'}), 400

        has_pixel_coords = x is not None and y is not None
        has_geo_coords = lat is not None and lon is not None

        if not (has_pixel_coords or has_geo_coords):
            return jsonify({'error': 'Missing coordinates (need x,y or lat,lon)'}), 400

        success = db.geocode_address(address_id, x, y, lat, lon)

        if not success:
            return jsonify({'error': 'Failed to geocode address'}), 500

        # Get next address
        next_address = db.get_current_address()
        progress = db.get_progress()

        return jsonify({
            'success': True,
            'next_address': next_address,
            'progress': progress
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/skip', methods=['POST'])
def skip():
    """Mark current address as skipped/uncertain"""
    try:
        data = request.json
        address_id = data.get('address_id')

        if not address_id:
            return jsonify({'error': 'Missing address_id'}), 400

        success = db.skip_address(address_id)

        if not success:
            return jsonify({'error': 'Failed to skip address'}), 500

        # Get next address
        next_address = db.get_current_address()
        progress = db.get_progress()

        return jsonify({
            'success': True,
            'next_address': next_address,
            'progress': progress
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/undo', methods=['POST'])
def undo():
    """Undo last action"""
    try:
        success = db.undo_last_action()

        if not success:
            return jsonify({'error': 'Nothing to undo'}), 400

        # Get current address (might have changed after undo)
        current_address = db.get_current_address()
        progress = db.get_progress()

        return jsonify({
            'success': True,
            'current_address': current_address,
            'progress': progress
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/progress', methods=['GET'])
def progress():
    """Get geocoding progress statistics"""
    try:
        stats = db.get_progress()
        return jsonify({
            'success': True,
            'progress': stats
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/points', methods=['GET'])
def get_points():
    """Get recently geocoded points for display"""
    try:
        limit = request.args.get('limit', type=int)
        if limit is not None and limit <= 0:
            limit = None
        min_lat = request.args.get('min_lat', type=float)
        max_lat = request.args.get('max_lat', type=float)
        min_lon = request.args.get('min_lon', type=float)
        max_lon = request.args.get('max_lon', type=float)

        bounds = None
        if None not in (min_lat, max_lat, min_lon, max_lon):
            bounds = {
                'min_lat': min_lat,
                'max_lat': max_lat,
                'min_lon': min_lon,
                'max_lon': max_lon,
            }

        points = db.get_geocoded_points(limit=limit, bounds=bounds)

        return jsonify({
            'success': True,
            'points': points
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/export', methods=['GET'])
def export():
    """Export geocoded addresses to CSV"""
    try:
        output_path = os.path.join(Config.BASE_DIR, 'data', 'export.csv')
        count = db.export_to_csv(output_path)

        return send_file(
            output_path,
            mimetype='text/csv',
            as_attachment=True,
            download_name='geocoded_addresses.csv'
        )

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/maps', methods=['GET'])
def list_maps():
    """List available map files"""
    try:
        maps_dir = Config.MAPS_DIR
        if not os.path.exists(maps_dir):
            return jsonify({'maps': []})

        map_files = []
        # Walk through directory and subdirectories
        for root, dirs, files in os.walk(maps_dir):
            # Skip tiles directories (they contain individual tile PNGs, not source maps)
            dirs[:] = [d for d in dirs if d != 'tiles']

            for f in files:
                if f.lower().endswith(('.png', '.jpg', '.jpeg', '.tiff', '.tif')):
                    # Get relative path from maps_dir
                    full_path = os.path.join(root, f)
                    rel_path = os.path.relpath(full_path, maps_dir)
                    map_files.append(rel_path)

        return jsonify({
            'success': True,
            'maps': sorted(map_files)
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/addresses', methods=['GET'])
def get_addresses():
    """Get paginated, filtered, sorted list of addresses"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        sort_by = request.args.get('sort_by', 'sort_order')
        sort_order = request.args.get('sort_order', 'ASC')
        filter_status = request.args.get('filter_status', None)
        filter_street = request.args.get('filter_street', None)
        search = request.args.get('search', None)

        result = db.get_addresses_paginated(
            page=page,
            per_page=per_page,
            sort_by=sort_by,
            sort_order=sort_order,
            filter_status=filter_status,
            filter_street=filter_street,
            search=search
        )

        return jsonify({
            'success': True,
            **result
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/streets', methods=['GET'])
def get_streets():
    """Get list of unique street names"""
    try:
        streets = db.get_unique_streets()

        return jsonify({
            'success': True,
            'streets': streets
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/set_current', methods=['POST'])
def set_current():
    """Set a specific address as the current one to geocode"""
    try:
        data = request.json
        address_id = data.get('address_id')

        if not address_id:
            return jsonify({'error': 'Missing address_id'}), 400

        # Get the address to verify it exists
        conn = db.get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM addresses WHERE id = ?', (address_id,))
        address = cursor.fetchone()
        conn.close()

        if not address:
            return jsonify({'error': 'Address not found'}), 404

        address_dict = dict(address)

        return jsonify({
            'success': True,
            'address': address_dict
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/update_geocode', methods=['POST'])
def update_geocode():
    """Update the geocoded position of an already-geocoded address"""
    try:
        data = request.json
        address_id = data.get('address_id')
        lat = data.get('lat')
        lon = data.get('lon')

        if address_id is None:
            return jsonify({'error': 'Missing address_id'}), 400

        if lat is None or lon is None:
            return jsonify({'error': 'Missing lat or lon'}), 400

        success = db.update_geocode_position(address_id, lat, lon)

        if not success:
            return jsonify({'error': 'Failed to update position (address not found or not geocoded)'}), 400

        return jsonify({
            'success': True,
            'message': 'Position updated successfully'
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/configure_map', methods=['POST'])
def configure_map():
    """Configure georeferencing bounds for a map"""
    try:
        data = request.json
        map_filename = data.get('map_filename')
        min_lat = data.get('min_lat')
        max_lat = data.get('max_lat')
        min_lon = data.get('min_lon')
        max_lon = data.get('max_lon')
        image_width = data.get('image_width')
        image_height = data.get('image_height')

        if not map_filename:
            return jsonify({'error': 'Missing map_filename'}), 400

        if any(x is None for x in [min_lat, max_lat, min_lon, max_lon]):
            return jsonify({'error': 'Missing required coordinates (min_lat, max_lat, min_lon, max_lon)'}), 400

        success = db.set_map_config(map_filename, min_lat, max_lat, min_lon, max_lon,
                                    image_width, image_height)

        if not success:
            return jsonify({'error': 'Failed to save map configuration'}), 500

        return jsonify({
            'success': True,
            'message': f'Map configuration saved for {map_filename}'
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/map_config/<path:map_filename>', methods=['GET'])
def get_map_config(map_filename):
    """Get georeferencing configuration for a map"""
    try:
        config = db.get_map_config(map_filename)

        if not config:
            return jsonify({
                'success': False,
                'message': 'No configuration found for this map'
            }), 404

        return jsonify({
            'success': True,
            'config': config
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    # Ensure data directory exists
    os.makedirs(os.path.join(Config.BASE_DIR, 'data'), exist_ok=True)
    os.makedirs(Config.MAPS_DIR, exist_ok=True)

    print("=" * 60)
    print("Historical Map Geocoder")
    print("=" * 60)
    print(f"Database: {Config.DATABASE_PATH}")
    print(f"Maps directory: {Config.MAPS_DIR}")
    print("\nPlace your historical map images in:")
    print(f"  {Config.MAPS_DIR}")
    print("\nServer starting at http://localhost:5002")
    print("=" * 60)

    app.run(debug=True, host='0.0.0.0', port=5002)
