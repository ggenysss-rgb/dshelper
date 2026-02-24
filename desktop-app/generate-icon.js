const fs = require('fs');
const { createCanvas } = require('@napi-rs/canvas');
const pngToIco = require('png-to-ico');

async function generateIcon() {
    // Try using canvas, fallback to downloading
    let canvas, ctx;
    try {
        canvas = createCanvas(256, 256);
        ctx = canvas.getContext('2d');
    } catch {
        // canvas not installed, create minimal BMP
        console.log('Canvas not available, generating simple icon...');
        await generateSimpleIcon();
        return;
    }

    // Background - dark rounded square
    ctx.fillStyle = '#0a0a1a';
    roundRect(ctx, 0, 0, 256, 256, 40);
    ctx.fill();

    // Gradient overlay
    const grad = ctx.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, 'rgba(220, 38, 38, 0.15)');
    grad.addColorStop(1, 'rgba(30, 10, 60, 0.3)');
    ctx.fillStyle = grad;
    roundRect(ctx, 0, 0, 256, 256, 40);
    ctx.fill();

    // "T" letter
    ctx.fillStyle = '#dc2626';
    ctx.font = 'bold 160px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('T', 128, 138);

    // Notification dot
    ctx.beginPath();
    ctx.arc(200, 56, 24, 0, Math.PI * 2);
    ctx.fillStyle = '#f97316';
    ctx.fill();
    ctx.strokeStyle = '#0a0a1a';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Save PNG
    const pngBuffer = canvas.toBuffer('image/png');
    fs.writeFileSync('icon.png', pngBuffer);
    console.log('✅ icon.png created');

    // Convert to ICO
    const toIco = pngToIco.default || pngToIco;
    const icoBuffer = await toIco(pngBuffer);
    fs.writeFileSync('icon.ico', icoBuffer);
    console.log('✅ icon.ico created');
}

async function generateSimpleIcon() {
    // Download a placeholder and convert
    const https = require('https');
    // Create a simple 16x16 ICO header with red color
    console.log('Please install @napi-rs/canvas: npm i -D @napi-rs/canvas');
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

generateIcon().catch(console.error);
