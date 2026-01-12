import os
import json
from collections import defaultdict

base_path = r"c:\Users\Zwonaka Mabege\OneDrive\Desktop\Zande Technologies\Disciplined\DisciplinedDisciples\public\Assets\Products"

folders = {
    "Hoodies": "Assets/Products/Hoodies",
    "Caps": "Assets/Products/Caps",
    "Classic tees": "Assets/Products/Classic tees",
    "Oversized tess": "Assets/Products/Oversized tess"
}

# Organize images by color
def extract_color(filename):
    """Extract color from filename"""
    filename_lower = filename.lower()
    
    if 'black' in filename_lower:
        return 'Black'
    elif 'maroon' in filename_lower:
        return 'Maroon'
    elif 'forest-green' in filename_lower or 'forest green' in filename_lower:
        return 'Green'
    elif 'purple' in filename_lower:
        return 'Purple'
    elif 'team-royal' in filename_lower or 'royal' in filename_lower:
        return 'Royal Blue'
    elif 'white' in filename_lower:
        return 'White'
    elif 'blue' in filename_lower and 'carolina' in filename_lower:
        return 'Blue'
    elif 'tropical-blue' in filename_lower or 'tropical blue' in filename_lower:
        return 'Light Blue'
    elif 'carolina-blue' in filename_lower:
        return 'Blue'
    elif 'irish-green' in filename_lower or 'irish green' in filename_lower:
        return 'Light Green'
    elif 'light-pink' in filename_lower or 'light pink' in filename_lower:
        return 'Light Pink'
    elif 'azalea' in filename_lower:
        return 'Pink'
    elif 'turf-green' in filename_lower or 'turf green' in filename_lower:
        return 'Green'
    elif 'yellow-haze' in filename_lower or 'yellow haze' in filename_lower:
        return 'Yellow'
    elif 'red' in filename_lower:
        return 'Red'
    elif 'navy' in filename_lower:
        return 'Navy'
    elif 'khaki' in filename_lower or 'sand-khaki' in filename_lower or 'sand khaki' in filename_lower:
        return 'Khakhi'
    elif 'faded-bone' in filename_lower or 'faded bone' in filename_lower:
        return 'Bone'
    elif 'city-green' in filename_lower or 'city green' in filename_lower:
        return 'City Green'
    elif 'dyed' in filename_lower:
        return 'Dyed'
    else:
        return 'Default'

# Process each folder
for folder_name, asset_path in folders.items():
    folder_path = os.path.join(base_path, folder_name)
    
    if not os.path.exists(folder_path):
        print(f"✗ {folder_name} not found")
        continue
    
    images = [f for f in os.listdir(folder_path) if f.endswith('.jpg')]
    
    # Group by color
    colors = defaultdict(list)
    for img in sorted(images):
        color = extract_color(img)
        colors[color].append(f"{asset_path}/{img}")
    
    print(f"\n{folder_name}: {len(images)} images")
    for color in sorted(colors.keys()):
        print(f"  {color}: {len(colors[color])} images")

print("\n✓ Analysis complete. Colors grouped above.")
