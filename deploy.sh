#!/bin/bash

# 1. Set your destination (Double check this path!)
VAULT_DIR="/storage/emulated/0/Documents/binx/.obsidian/plugins/native-print"

# 2. Run the build
echo "Building project..."
npm run build

# 3. Check if build succeeded
if [ $? -eq 0 ]; then
    echo "Build successful. Deploying to vault..."
    
    # Create directory if it doesn't exist
    mkdir -p "$VAULT_DIR"
    
    # Copy only the necessary files
    cp main.js manifest.json styles.css "$VAULT_DIR/"
    
    echo "Done! Restart Obsidian to see changes."
else
    echo "Build failed. Check logs."
fi
