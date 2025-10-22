# Address List Feature Guide

## Overview

The geocoder now includes a sophisticated address list viewer with filtering, sorting, and pagination capabilities!

## Features

### 1. Expandable Address List
- Click "Address List" header in sidebar to expand/collapse
- Shows paginated table of all addresses
- Compact when collapsed, detailed when expanded

### 2. Table Columns
- **Street**: Street name
- **No.**: House number
- **Status**: Color-coded status badge
  - Yellow: Pending
  - Green: Geocoded
  - Red: Skipped

### 3. Filtering

**By Status:**
- All
- Pending (not yet geocoded)
- Geocoded (completed)
- Skipped (marked as uncertain)

**By Street:**
- Dropdown with all unique street names
- Select specific street to see only those addresses

**Search Box:**
- Type to search across street names and house numbers
- Real-time filtering (300ms delay)
- Example: "Main 1" finds "Main Street 1", "Main Street 10", etc.

### 4. Sorting

Click any column header to sort:
- **Street**: Alphabetical (A-Z or Z-A)
- **No.**: Numeric (1-9 or 9-1)
- **Status**: Alphabetical (geocoded, pending, skipped)

**Visual indicators:**
- ▲ = Ascending sort
- ▼ = Descending sort
- Click again to reverse order

### 5. Pagination

**Page Size:**
- 20 per page
- 50 per page (default)
- 100 per page
- All (no pagination)

**Navigation:**
- « First page
- ‹ Previous page
- Page numbers (click to jump)
- › Next page
- » Last page

Shows "Showing 1-50 of 150 addresses" info

### 6. Address Selection

**Click any row** to select that address as current:
- Row highlights in blue
- Address shows in "Current Address" section
- Map stays at current position
- Ready to geocode

### 7. Auto-Advance Toggle

**Checkbox: "Auto-advance"**

**ON (checked, default):**
- Geocode address → automatically advances to next
- Next = next in filtered/sorted list
- Example: Filter by "Main Street" → geocodes advance through Main Street only

**OFF (unchecked):**
- Geocode address → stays on same address
- Must manually select next address from list
- Useful for reviewing/re-geocoding specific addresses

## Workflows

### Workflow 1: Geocode One Street at a Time

```
1. Expand address list
2. Filter by Street: "Main Street"
3. Set per page: "All"
4. Auto-advance: ON
5. Click first address in list
6. Right-click map to geocode
7. Automatically advances to next Main Street address
8. Repeat until street complete
```

### Workflow 2: Review All Skipped Addresses

```
1. Expand address list
2. Filter by Status: "Skipped"
3. Set per page: "All"
4. See all uncertain addresses at once
5. Click each one to review
6. Re-geocode or leave skipped
```

### Workflow 3: Find and Fix Specific Address

```
1. Expand address list
2. Search: "Oak 15"
3. Table filters to matching addresses
4. Click the address to select
5. Right-click map to geocode (or re-geocode)
```

### Workflow 4: Work Through Pending Only

```
1. Expand address list
2. Filter by Status: "Pending"
3. Sort by: Street (groups addresses by street)
4. Auto-advance: ON
5. Click first address
6. Geocode through all pending addresses
```

### Workflow 5: Manual Selection Mode

```
1. Expand address list
2. Auto-advance: OFF
3. Click address → geocode → click next → geocode
4. Full manual control over order
5. Good for non-sequential geocoding
```

## Tips & Tricks

### Keyboard + Mouse Combo
- **Search box** = Type to find
- **Click row** = Select address
- **Right-click map** = Geocode
- **Space** = Skip (keyboard)
- **Z** = Undo (keyboard)

### Efficient Street-by-Street
1. Sort by Street (groups together)
2. Set per page: 100 (or "All")
3. Auto-advance: ON
4. Work through each street group

### Filter Combinations
- Filter by Status: "Pending" + Street: "Main Street"
- Shows only pending addresses on Main Street
- All filters work together

### Page Size Strategy
- **20**: Good for large datasets, less scrolling
- **50**: Balanced, see good amount of context
- **100**: See lots at once, good for reviewing
- **All**: See entire filtered list (use with filters!)

## UI Indicators

### Current Address
- **Blue highlight** in table
- **Bold text** for current row
- Stays highlighted even when scrolling/paging

### Status Colors
- **Yellow badge**: Pending (not geocoded yet)
- **Green badge**: Geocoded (has coordinates)
- **Red badge**: Skipped (marked uncertain)

### Sort Indicators
- **Gray triangle**: Column not sorted
- **Blue ▲**: Sorted ascending
- **Blue ▼**: Sorted descending

### Pagination States
- **Enabled buttons**: Can navigate
- **Disabled buttons**: At first/last page (grayed out)
- **Blue page number**: Current page
- **White page numbers**: Other pages (clickable)

## Integration with Geocoding

### How Selection Works
1. Click row in table → Sets as current address
2. Current address shows in sidebar
3. Right-click map → Geocodes current address
4. If auto-advance ON → Advances to next in filtered list
5. If auto-advance OFF → Stays on same address

### Next Address Logic
When auto-advance is ON, "next" means:
- Next in the **filtered** list (not original order!)
- If filtered by street: next on that street
- If filtered by status: next with that status
- If sorted differently: next in sort order

### After Geocoding
- Table updates in real-time
- Status badge changes to green "GEOCODED"
- If pending filter active, address disappears from list
- Progress bar updates
- Pagination may adjust (if last item on page)

## Performance

### Loading Speed
- 50 addresses: ~100ms
- 500 addresses: ~200ms
- 5,000 addresses: ~500ms

### Search Performance
- Real-time with 300ms debounce
- Fast even with 5,000+ addresses
- Uses SQL LIKE queries

### Pagination
- Only loads current page (fast)
- "All" loads everything (slower for large datasets)

## Common Scenarios

### "I want to geocode all addresses on one street"
1. Filter by Street: [Your street]
2. Set per page: "All"
3. Auto-advance: ON
4. Click first → geocode through list

### "I want to review my work"
1. Filter by Status: "Geocoded"
2. Sort by: Street
3. Scroll through to verify

### "I made mistakes, need to find them"
1. Filter by Status: "Skipped"
2. Review each one
3. Re-geocode or confirm skip

### "I want to work on house numbers in order"
1. Filter by Street: [Your street]
2. Sort by: No. (ascending)
3. Auto-advance: ON
4. Click first, work through sequentially

### "I want random access, not sequential"
1. Auto-advance: OFF
2. Click any address anytime
3. Geocode it
4. Manually select next

## Troubleshooting

### Table shows "Loading addresses..."
- **Cause**: No addresses imported yet
- **Fix**: Import CSV first

### Table shows "No addresses found"
- **Cause**: Filters exclude all addresses
- **Fix**: Clear filters (set to "All")

### Auto-advance not working
- **Check**: Auto-advance checkbox is checked
- **Check**: There are more addresses in filtered list
- **Note**: If you're on last address, stays on it

### Can't find an address
- **Try**: Clear all filters
- **Try**: Search box with partial text
- **Try**: Sort by different column

### Page numbers missing
- **Cause**: Using "All" pages
- **Normal**: No pagination when showing all

### Sort not working
- **Try**: Click column header again
- **Check**: Look for ▲ or ▼ indicator
- **Note**: Numbers sort numerically, not alphabetically

## Shortcuts Summary

**Mouse:**
- Click row = Select address
- Click column header = Sort
- Click page number = Jump to page
- Right-click map = Geocode

**Keyboard:**
- Space = Skip current address
- Z = Undo last action
- Type in search = Filter addresses

**Dropdowns:**
- Status filter = Filter by completion status
- Street filter = Filter by street name
- Per page = Change items per page

**Checkbox:**
- Auto-advance = Toggle auto-advance mode

## Advanced: Filter Chains

Combine filters for powerful selection:

**Example 1: Pending Main Street addresses**
- Status: Pending
- Street: Main Street
- Result: Only unfinished addresses on Main Street

**Example 2: Geocoded Oak Avenue**
- Status: Geocoded
- Street: Oak Avenue
- Result: Review completed work on one street

**Example 3: Search within filter**
- Street: Main Street
- Search: "10"
- Result: "10", "100", "101" on Main Street only

## That's It!

The address list gives you full control over your geocoding workflow. Mix and match features to find what works best for your data!
