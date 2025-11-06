import sqlite3
import pandas as pd
from datetime import datetime
from typing import Optional, List, Dict
from config import Config


class Database:
    """Database handler for geocoding application"""

    def __init__(self, db_path: str = None):
        self.db_path = db_path or Config.DATABASE_PATH
        self.init_database()

    def get_connection(self):
        """Get database connection"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def init_database(self):
        """Initialize database schema"""
        conn = self.get_connection()
        cursor = conn.cursor()

        # Main addresses table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS addresses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                street TEXT NOT NULL,
                number TEXT NOT NULL,
                x_coord REAL,
                y_coord REAL,
                lat REAL,
                lon REAL,
                status TEXT DEFAULT 'pending',
                sort_order INTEGER NOT NULL,
                timestamp TEXT,
                UNIQUE(street, number)
            )
        ''')

        # Undo history table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS undo_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                address_id INTEGER NOT NULL,
                action_type TEXT NOT NULL,
                old_x_coord REAL,
                old_y_coord REAL,
                old_lat REAL,
                old_lon REAL,
                old_status TEXT,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (address_id) REFERENCES addresses(id)
            )
        ''')

        # Map configuration table for georeferencing
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS map_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                map_filename TEXT UNIQUE NOT NULL,
                min_lat REAL NOT NULL,
                max_lat REAL NOT NULL,
                min_lon REAL NOT NULL,
                max_lon REAL NOT NULL,
                image_width INTEGER,
                image_height INTEGER,
                created_at TEXT NOT NULL
            )
        ''')

        conn.commit()
        conn.close()

    def import_csv_data(self, csv_data: str, street_column: str = None, number_column: str = None,
                        lat_column: str = None, lon_column: str = None) -> int:
        """
        Import addresses from CSV data string

        Args:
            csv_data: CSV content as string
            street_column: Name of street column (auto-detect if None)
            number_column: Name of number column (auto-detect if None)
            lat_column: Name of latitude column (optional, for pre-geocoded data)
            lon_column: Name of longitude column (optional, for pre-geocoded data)

        Returns:
            Number of addresses imported
        """
        from io import StringIO

        # Parse CSV from string
        df = pd.read_csv(StringIO(csv_data))

        # Auto-detect columns if not specified
        if street_column is None:
            possible_street_cols = ['street', 'Street', 'street_name', 'StreetName', 'address']
            for col in possible_street_cols:
                if col in df.columns:
                    street_column = col
                    break
            if street_column is None:
                street_column = df.columns[0]

        if number_column is None:
            possible_number_cols = ['number', 'Number', 'house_number', 'HouseNumber', 'num', 'no']
            for col in possible_number_cols:
                if col in df.columns:
                    number_column = col
                    break
            if number_column is None:
                number_column = df.columns[1] if len(df.columns) > 1 else df.columns[0]

        conn = self.get_connection()
        cursor = conn.cursor()

        # Clear existing data
        cursor.execute('DELETE FROM addresses')
        cursor.execute('DELETE FROM undo_history')

        # Insert addresses in order
        imported = 0
        has_coords = lat_column and lon_column and lat_column in df.columns and lon_column in df.columns

        for idx, row in df.iterrows():
            try:
                if has_coords:
                    # Import with pre-geocoded coordinates
                    lat = row[lat_column]
                    lon = row[lon_column]
                    # Check if lat/lon are valid (not NaN/empty)
                    if pd.notna(lat) and pd.notna(lon):
                        cursor.execute('''
                            INSERT INTO addresses (street, number, lat, lon, status, sort_order, timestamp)
                            VALUES (?, ?, ?, ?, 'geocoded', ?, ?)
                        ''', (str(row[street_column]), str(row[number_column]),
                              float(lat), float(lon), idx, datetime.now().isoformat()))
                    else:
                        # No valid coords, insert as pending
                        cursor.execute('''
                            INSERT INTO addresses (street, number, status, sort_order)
                            VALUES (?, ?, 'pending', ?)
                        ''', (str(row[street_column]), str(row[number_column]), idx))
                else:
                    # Import without coordinates
                    cursor.execute('''
                        INSERT INTO addresses (street, number, status, sort_order)
                        VALUES (?, ?, 'pending', ?)
                    ''', (str(row[street_column]), str(row[number_column]), idx))
                imported += 1
            except sqlite3.IntegrityError:
                # Skip duplicates
                pass

        conn.commit()
        conn.close()
        return imported

    def import_csv(self, csv_path: str, street_column: str = None, number_column: str = None,
                   lat_column: str = None, lon_column: str = None) -> int:
        """
        Import addresses from CSV file

        Args:
            csv_path: Path to CSV file
            street_column: Name of street column (auto-detect if None)
            number_column: Name of number column (auto-detect if None)
            lat_column: Name of latitude column (optional, for pre-geocoded data)
            lon_column: Name of longitude column (optional, for pre-geocoded data)

        Returns:
            Number of addresses imported
        """
        df = pd.read_csv(csv_path)

        # Auto-detect columns if not specified
        if street_column is None:
            possible_street_cols = ['street', 'Street', 'street_name', 'StreetName', 'address']
            for col in possible_street_cols:
                if col in df.columns:
                    street_column = col
                    break
            if street_column is None:
                street_column = df.columns[0]

        if number_column is None:
            possible_number_cols = ['number', 'Number', 'house_number', 'HouseNumber', 'num', 'no']
            for col in possible_number_cols:
                if col in df.columns:
                    number_column = col
                    break
            if number_column is None:
                number_column = df.columns[1] if len(df.columns) > 1 else df.columns[0]

        conn = self.get_connection()
        cursor = conn.cursor()

        # Clear existing data
        cursor.execute('DELETE FROM addresses')
        cursor.execute('DELETE FROM undo_history')

        # Insert addresses in order
        imported = 0
        has_coords = lat_column and lon_column and lat_column in df.columns and lon_column in df.columns

        for idx, row in df.iterrows():
            try:
                if has_coords:
                    # Import with pre-geocoded coordinates
                    lat = row[lat_column]
                    lon = row[lon_column]
                    # Check if lat/lon are valid (not NaN/empty)
                    if pd.notna(lat) and pd.notna(lon):
                        cursor.execute('''
                            INSERT INTO addresses (street, number, lat, lon, status, sort_order, timestamp)
                            VALUES (?, ?, ?, ?, 'geocoded', ?, ?)
                        ''', (str(row[street_column]), str(row[number_column]),
                              float(lat), float(lon), idx, datetime.now().isoformat()))
                    else:
                        # No valid coords, insert as pending
                        cursor.execute('''
                            INSERT INTO addresses (street, number, status, sort_order)
                            VALUES (?, ?, 'pending', ?)
                        ''', (str(row[street_column]), str(row[number_column]), idx))
                else:
                    # Import without coordinates
                    cursor.execute('''
                        INSERT INTO addresses (street, number, status, sort_order)
                        VALUES (?, ?, 'pending', ?)
                    ''', (str(row[street_column]), str(row[number_column]), idx))
                imported += 1
            except sqlite3.IntegrityError:
                # Skip duplicates
                pass

        conn.commit()
        conn.close()
        return imported

    def import_backup_from_csv(self, csv_data: str) -> int:
        """
        Import addresses from a backup CSV export (restores all fields including status)

        Expected CSV format matches export_to_csv() output:
        street, number, x_coord, y_coord, lat, lon, status, timestamp

        Args:
            csv_data: CSV content as string from a backup export

        Returns:
            Number of addresses imported
        """
        from io import StringIO

        # Parse CSV from string
        df = pd.read_csv(StringIO(csv_data))

        # Validate required columns
        if 'street' not in df.columns or 'number' not in df.columns:
            raise ValueError("CSV must contain 'street' and 'number' columns")

        conn = self.get_connection()
        cursor = conn.cursor()

        # Clear existing data
        cursor.execute('DELETE FROM addresses')
        cursor.execute('DELETE FROM undo_history')

        # Insert addresses with all fields
        imported = 0

        for idx, row in df.iterrows():
            try:
                # Extract all fields, handling missing columns
                street = str(row['street'])
                number = str(row['number'])
                x_coord = float(row['x_coord']) if 'x_coord' in df.columns and pd.notna(row['x_coord']) else None
                y_coord = float(row['y_coord']) if 'y_coord' in df.columns and pd.notna(row['y_coord']) else None
                lat = float(row['lat']) if 'lat' in df.columns and pd.notna(row['lat']) else None
                lon = float(row['lon']) if 'lon' in df.columns and pd.notna(row['lon']) else None
                status = str(row['status']) if 'status' in df.columns and pd.notna(row['status']) else 'pending'
                timestamp = str(row['timestamp']) if 'timestamp' in df.columns and pd.notna(row['timestamp']) else None

                # Use idx as sort_order if not in CSV (preserve import order)
                sort_order = int(row['sort_order']) if 'sort_order' in df.columns and pd.notna(row['sort_order']) else idx

                # Validate status value
                if status not in ['pending', 'geocoded', 'skipped']:
                    status = 'pending'

                cursor.execute('''
                    INSERT INTO addresses (street, number, x_coord, y_coord, lat, lon, status, sort_order, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (street, number, x_coord, y_coord, lat, lon, status, sort_order, timestamp))

                imported += 1
            except sqlite3.IntegrityError:
                # Skip duplicates
                pass
            except (ValueError, TypeError) as e:
                # Skip rows with invalid data
                pass

        conn.commit()
        conn.close()
        return imported

    def get_current_address(self, current_x: float = None, current_y: float = None,
                           current_lat: float = None, current_lon: float = None,
                           last_street: str = None) -> Optional[Dict]:
        """
        Get the next pending address to geocode.

        Args:
            current_x: Unused (retained for API compatibility)
            current_y: Unused (retained for API compatibility)
            current_lat: Unused (retained for API compatibility)
            current_lon: Unused (retained for API compatibility)
            last_street: Unused (retained for API compatibility)

        Returns:
            Next address dict or None if no pending addresses
        """
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('''
            SELECT * FROM addresses
            WHERE status = 'pending'
            ORDER BY sort_order ASC
            LIMIT 1
        ''')
        row = cursor.fetchone()
        conn.close()

        if row:
            return dict(row)
        return None

    def geocode_address(self, address_id: int, x: float = None, y: float = None, lat: float = None, lon: float = None) -> bool:
        """
        Save geocoded coordinates for an address

        Args:
            address_id: ID of address to geocode
            x: X pixel coordinate (optional)
            y: Y pixel coordinate (optional)
            lat: Latitude (optional)
            lon: Longitude (optional)

        Returns:
            True if successful
        """
        conn = self.get_connection()
        cursor = conn.cursor()

        # Get current state for undo
        cursor.execute('SELECT * FROM addresses WHERE id = ?', (address_id,))
        old_state = cursor.fetchone()

        if not old_state:
            conn.close()
            return False

        # Save to undo history
        cursor.execute('''
            INSERT INTO undo_history (address_id, action_type, old_x_coord, old_y_coord,
                                     old_lat, old_lon, old_status, timestamp)
            VALUES (?, 'geocode', ?, ?, ?, ?, ?, ?)
        ''', (address_id, old_state['x_coord'], old_state['y_coord'],
              old_state['lat'], old_state['lon'], old_state['status'],
              datetime.now().isoformat()))

        # Update address
        cursor.execute('''
            UPDATE addresses
            SET x_coord = ?, y_coord = ?, lat = ?, lon = ?,
                status = 'geocoded', timestamp = ?
            WHERE id = ?
        ''', (x, y, lat, lon, datetime.now().isoformat(), address_id))

        # Clean up old undo history (keep only last N actions)
        cursor.execute('''
            DELETE FROM undo_history
            WHERE id NOT IN (
                SELECT id FROM undo_history
                ORDER BY id DESC
                LIMIT ?
            )
        ''', (Config.UNDO_STACK_SIZE,))

        conn.commit()
        conn.close()
        return True

    def skip_address(self, address_id: int) -> bool:
        """Mark an address as skipped/uncertain"""
        conn = self.get_connection()
        cursor = conn.cursor()

        # Get current state for undo
        cursor.execute('SELECT * FROM addresses WHERE id = ?', (address_id,))
        old_state = cursor.fetchone()

        if not old_state:
            conn.close()
            return False

        # Save to undo history
        cursor.execute('''
            INSERT INTO undo_history (address_id, action_type, old_x_coord, old_y_coord,
                                     old_lat, old_lon, old_status, timestamp)
            VALUES (?, 'skip', ?, ?, ?, ?, ?, ?)
        ''', (address_id, old_state['x_coord'], old_state['y_coord'],
              old_state['lat'], old_state['lon'], old_state['status'],
              datetime.now().isoformat()))

        # Update address
        cursor.execute('''
            UPDATE addresses
            SET status = 'skipped', timestamp = ?
            WHERE id = ?
        ''', (datetime.now().isoformat(), address_id))

        conn.commit()
        conn.close()
        return True

    def undo_last_action(self) -> bool:
        """Undo the most recent action"""
        conn = self.get_connection()
        cursor = conn.cursor()

        # Get most recent undo record
        cursor.execute('''
            SELECT * FROM undo_history
            ORDER BY id DESC
            LIMIT 1
        ''')

        undo_record = cursor.fetchone()

        if not undo_record:
            conn.close()
            return False

        # Restore old state
        cursor.execute('''
            UPDATE addresses
            SET x_coord = ?, y_coord = ?, lat = ?, lon = ?, status = ?
            WHERE id = ?
        ''', (undo_record['old_x_coord'], undo_record['old_y_coord'],
              undo_record['old_lat'], undo_record['old_lon'],
              undo_record['old_status'], undo_record['address_id']))

        # Remove undo record
        cursor.execute('DELETE FROM undo_history WHERE id = ?', (undo_record['id'],))

        conn.commit()
        conn.close()
        return True

    def get_progress(self) -> Dict[str, int]:
        """Get geocoding progress statistics"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('''
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 'geocoded' THEN 1 ELSE 0 END) as geocoded,
                SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
            FROM addresses
        ''')

        row = cursor.fetchone()
        conn.close()

        return {
            'total': row['total'] or 0,
            'geocoded': row['geocoded'] or 0,
            'skipped': row['skipped'] or 0,
            'pending': row['pending'] or 0
        }

    def get_geocoded_points(self, limit: Optional[int] = None, bounds: Optional[Dict[str, float]] = None) -> List[Dict]:
        """Get geocoded points for display on map"""
        conn = self.get_connection()
        cursor = conn.cursor()

        query = '''
            SELECT id, street, number, x_coord, y_coord, lat, lon
            FROM addresses
            WHERE status = 'geocoded' AND lat IS NOT NULL AND lon IS NOT NULL
        '''

        params = []

        if bounds:
            min_lat = min(bounds['min_lat'], bounds['max_lat'])
            max_lat = max(bounds['min_lat'], bounds['max_lat'])
            min_lon = min(bounds['min_lon'], bounds['max_lon'])
            max_lon = max(bounds['min_lon'], bounds['max_lon'])

            query += ' AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?'
            params.extend([min_lat, max_lat, min_lon, max_lon])

        query += ' ORDER BY timestamp DESC'

        if limit is not None and limit > 0:
            query += ' LIMIT ?'
            params.append(limit)

        cursor.execute(query, params)

        points = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return points

    def export_to_csv(self, output_path: str) -> int:
        """Export geocoded addresses to CSV"""
        conn = self.get_connection()

        df = pd.read_sql_query('''
            SELECT street, number, x_coord, y_coord, lat, lon, status, timestamp
            FROM addresses
            ORDER BY sort_order
        ''', conn)

        df.to_csv(output_path, index=False)
        conn.close()

        return len(df)

    def get_addresses_paginated(
        self,
        page: int = 1,
        per_page: int = 50,
        sort_by: str = 'sort_order',
        sort_order: str = 'ASC',
        filter_status: str = None,
        filter_street: str = None,
        search: str = None
    ) -> Dict:
        """
        Get paginated list of addresses with filtering and sorting

        Args:
            page: Page number (1-indexed)
            per_page: Number of addresses per page
            sort_by: Column to sort by (sort_order, street, number, status, timestamp)
            sort_order: ASC or DESC
            filter_status: Filter by status (pending, geocoded, skipped)
            filter_street: Filter by exact street name
            search: Search in street name or house number

        Returns:
            Dict with addresses, total, pages, current_page
        """
        conn = self.get_connection()
        cursor = conn.cursor()

        # Build WHERE clause
        where_clauses = []
        params = []

        if filter_status:
            where_clauses.append('status = ?')
            params.append(filter_status)

        if filter_street:
            where_clauses.append('street = ?')
            params.append(filter_street)

        if search:
            where_clauses.append('(street LIKE ? OR number LIKE ?)')
            search_pattern = f'%{search}%'
            params.extend([search_pattern, search_pattern])

        where_clause = ' AND '.join(where_clauses) if where_clauses else '1=1'

        # Validate sort parameters
        valid_sort_columns = ['sort_order', 'street', 'number', 'status', 'timestamp', 'id']
        if sort_by not in valid_sort_columns:
            sort_by = 'sort_order'

        if sort_order.upper() not in ['ASC', 'DESC']:
            sort_order = 'ASC'
        sort_order_upper = sort_order.upper()

        # Build ORDER BY clause with natural ordering support for street/number
        if sort_by == 'street':
            order_clause = (
                f"street COLLATE NOCASE {sort_order_upper}, "
                f"CAST(number AS INTEGER) {sort_order_upper}, "
                f"number COLLATE NOCASE {sort_order_upper}"
            )
        elif sort_by == 'number':
            order_clause = (
                f"CAST(number AS INTEGER) {sort_order_upper}, "
                f"number COLLATE NOCASE {sort_order_upper}"
            )
        else:
            order_clause = f"{sort_by} {sort_order_upper}"

        # Get total count
        count_query = f'SELECT COUNT(*) FROM addresses WHERE {where_clause}'
        cursor.execute(count_query, params)
        total = cursor.fetchone()[0]

        # Calculate pagination
        total_pages = (total + per_page - 1) // per_page if per_page > 0 else 1
        page = max(1, min(page, total_pages if total_pages > 0 else 1))
        offset = (page - 1) * per_page

        # Get addresses
        query = f'''
            SELECT id, street, number, x_coord, y_coord, lat, lon, status, timestamp, sort_order
            FROM addresses
            WHERE {where_clause}
            ORDER BY {order_clause}
        '''

        # Add pagination unless per_page is 0 (meaning "All")
        if per_page > 0:
            query += ' LIMIT ? OFFSET ?'
            cursor.execute(query, params + [per_page, offset])
        else:
            cursor.execute(query, params)

        addresses = [dict(row) for row in cursor.fetchall()]
        conn.close()

        return {
            'addresses': addresses,
            'total': total,
            'pages': total_pages,
            'current_page': page,
            'per_page': per_page
        }

    def get_unique_streets(self) -> List[str]:
        """Get list of unique street names"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('''
            SELECT DISTINCT street
            FROM addresses
            ORDER BY street
        ''')

        streets = [row['street'] for row in cursor.fetchall()]
        conn.close()

        return streets

    def update_geocode_position(self, address_id: int, lat: float, lon: float) -> bool:
        """
        Update the geocoded position of an already-geocoded address

        Args:
            address_id: ID of address to update
            lat: New latitude
            lon: New longitude

        Returns:
            True if successful
        """
        conn = self.get_connection()
        cursor = conn.cursor()

        # Verify address exists and is geocoded
        cursor.execute('SELECT * FROM addresses WHERE id = ?', (address_id,))
        address = cursor.fetchone()

        if not address:
            conn.close()
            return False

        if address['status'] != 'geocoded':
            conn.close()
            return False

        # Save to undo history
        cursor.execute('''
            INSERT INTO undo_history (address_id, action_type, old_x_coord, old_y_coord,
                                     old_lat, old_lon, old_status, timestamp)
            VALUES (?, 'update_position', ?, ?, ?, ?, ?, ?)
        ''', (address_id, address['x_coord'], address['y_coord'],
              address['lat'], address['lon'], address['status'],
              datetime.now().isoformat()))

        # Update position
        cursor.execute('''
            UPDATE addresses
            SET lat = ?, lon = ?, timestamp = ?
            WHERE id = ?
        ''', (lat, lon, datetime.now().isoformat(), address_id))

        # Clean up old undo history
        cursor.execute('''
            DELETE FROM undo_history
            WHERE id NOT IN (
                SELECT id FROM undo_history
                ORDER BY id DESC
                LIMIT ?
            )
        ''', (Config.UNDO_STACK_SIZE,))

        conn.commit()
        conn.close()
        return True

    # --- Map Configuration and Georeferencing ---

    def set_map_config(self, map_filename: str, min_lat: float, max_lat: float,
                      min_lon: float, max_lon: float, image_width: int = None,
                      image_height: int = None) -> bool:
        """
        Set georeferencing bounds for a map

        Args:
            map_filename: Name of the map file
            min_lat: Minimum latitude (south edge)
            max_lat: Maximum latitude (north edge)
            min_lon: Minimum longitude (west edge)
            max_lon: Maximum longitude (east edge)
            image_width: Image width in pixels (optional)
            image_height: Image height in pixels (optional)

        Returns:
            True if successful
        """
        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute('''
                INSERT OR REPLACE INTO map_config
                (map_filename, min_lat, max_lat, min_lon, max_lon, image_width, image_height, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (map_filename, min_lat, max_lat, min_lon, max_lon,
                  image_width, image_height, datetime.now().isoformat()))

            conn.commit()
            conn.close()
            return True
        except Exception:
            conn.close()
            return False

    def get_map_config(self, map_filename: str) -> Optional[Dict]:
        """
        Get georeferencing bounds for a map

        Args:
            map_filename: Name of the map file

        Returns:
            Dict with map configuration or None if not found
        """
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM map_config WHERE map_filename = ?', (map_filename,))
        row = cursor.fetchone()
        conn.close()

        if row:
            return dict(row)
        return None
