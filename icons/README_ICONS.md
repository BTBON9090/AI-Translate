# AI Minimal Translator Icons

This directory contains SVG icons that need to be converted to PNG format for Chrome extension use.

## Required PNG Files
- icon16.png (16x16 pixels)
- icon48.png (48x48 pixels)
- icon128.png (128x128 pixels)

## How to Convert SVG to PNG

### Option 1: Online Converter
1. Open https://cloudconvert.com/svg-to-png
2. Upload the SVG files from this directory
3. Set the appropriate dimensions for each file
4. Download the PNG files and replace the empty placeholder files in this directory

### Option 2: Using Inkscape (Free Desktop Tool)
1. Install Inkscape from https://inkscape.org/
2. Open each SVG file in Inkscape
3. Go to File > Export PNG Image
4. Set the width and height to match the required dimensions
5. Export and save as the corresponding PNG file

### Option 3: Using ImageMagick (Command Line)
```bash
# Install ImageMagick if not already installed
# For macOS: brew install imagemagick
# For Ubuntu: sudo apt install imagemagick

# Convert SVG to PNG with specific dimensions
convert -size 16x16 icon16.svg icon16.png
convert -size 48x48 icon48.svg icon48.png
convert -size 128x128 icon128.svg icon128.png
```

## Placeholder Files
The empty PNG files in this directory are just placeholders. Please replace them with the converted PNG files before publishing the extension.