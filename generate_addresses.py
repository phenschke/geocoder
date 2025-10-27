#!/usr/bin/env python3
"""
Generate full address list from streets with maximum house numbers.

Usage:
    python generate_addresses.py streets_with_max.csv addresses.csv

Input CSV format:
    street,max_number
    Leopoldstraße,50
    Ludwigstraße,75

Output CSV format:
    street,number
    Leopoldstraße,1
    Leopoldstraße,2
    ...
    Leopoldstraße,50
    Ludwigstraße,1
    ...
"""

import csv
import sys
from pathlib import Path


def generate_addresses(input_path: str, output_path: str, street_col: str = 'street', max_col: str = 'max_number'):
    """
    Generate full address list from streets with maximum house numbers.

    Args:
        input_path: Path to input CSV with street names and max numbers
        output_path: Path to output CSV with expanded addresses
        street_col: Name of street column (default: 'street')
        max_col: Name of max number column (default: 'max_number')
    """
    input_file = Path(input_path)
    output_file = Path(output_path)

    if not input_file.exists():
        print(f"Error: Input file not found: {input_path}")
        sys.exit(1)

    print(f"Reading streets from: {input_path}")

    total_addresses = 0
    total_streets = 0

    try:
        with open(input_file, 'r', encoding='utf-8') as infile, \
             open(output_file, 'w', encoding='utf-8', newline='') as outfile:

            reader = csv.DictReader(infile)

            # Verify columns exist
            if street_col not in reader.fieldnames:
                print(f"Error: Column '{street_col}' not found in input CSV")
                print(f"Available columns: {', '.join(reader.fieldnames)}")
                sys.exit(1)

            if max_col not in reader.fieldnames:
                print(f"Error: Column '{max_col}' not found in input CSV")
                print(f"Available columns: {', '.join(reader.fieldnames)}")
                sys.exit(1)

            # Write output CSV
            writer = csv.DictWriter(outfile, fieldnames=['street', 'number'])
            writer.writeheader()

            for row in reader:
                street = row[street_col].strip()
                max_number_str = row[max_col].strip()

                if not street:
                    print(f"Warning: Skipping row with empty street name")
                    continue

                try:
                    max_number = int(max_number_str)
                except ValueError:
                    print(f"Warning: Invalid max_number '{max_number_str}' for street '{street}', skipping")
                    continue

                if max_number <= 0:
                    print(f"Warning: max_number must be positive for street '{street}', skipping")
                    continue

                # Generate addresses from 1 to max_number
                for number in range(1, max_number + 1):
                    writer.writerow({
                        'street': street,
                        'number': number
                    })
                    total_addresses += 1

                total_streets += 1
                if total_streets % 100 == 0:
                    print(f"Processed {total_streets} streets, generated {total_addresses} addresses...")

        print(f"\n✓ Success!")
        print(f"  Processed: {total_streets} streets")
        print(f"  Generated: {total_addresses} addresses")
        print(f"  Output: {output_path}")

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        print("\nUsage:")
        print("  python generate_addresses.py <input_csv> <output_csv> [street_col] [max_col]")
        print("\nExample:")
        print("  python generate_addresses.py streets.csv addresses.csv")
        print("  python generate_addresses.py streets.csv addresses.csv street max_number")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]
    street_col = sys.argv[3] if len(sys.argv) > 3 else 'street'
    max_col = sys.argv[4] if len(sys.argv) > 4 else 'max_number'

    generate_addresses(input_path, output_path, street_col, max_col)


if __name__ == '__main__':
    main()
