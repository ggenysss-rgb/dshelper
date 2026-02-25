#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
//  Update Prompt — adds new d1reevo examples from conversation log
//  Usage: node scripts/updatePrompt.js
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'data', 'conversation_log.json');
const PROMPT_FILE = path.join(__dirname, '..', 'neuro_style_prompt.txt');

function run() {
    // Load conversation log
    if (!fs.existsSync(LOG_FILE)) {
        console.log('❌ conversation_log.json not found. Bot needs to run first to collect data.');
        return;
    }

    const entries = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    const manualEntries = entries.filter(e => e.type === 'manual' && e.answer && e.answer.length > 5);

    console.log(`📊 Stats: ${entries.length} total entries, ${manualEntries.length} manual responses`);

    if (manualEntries.length === 0) {
        console.log('⚠️ No manual responses to add yet.');
        return;
    }

    // Load current prompt
    let prompt = fs.readFileSync(PROMPT_FILE, 'utf8');

    // Extract existing examples (lines starting with '- "')
    const existingExamples = new Set();
    for (const line of prompt.split('\n')) {
        const m = line.match(/^- "(.+)"$/);
        if (m) existingExamples.add(m[1]);
    }

    console.log(`📝 Current prompt has ${existingExamples.size} examples`);

    // Find new unique answers not already in prompt
    const newExamples = [];
    for (const entry of manualEntries) {
        const answer = entry.answer.trim();
        // Skip very short or already existing
        if (answer.length < 5) continue;
        if (existingExamples.has(answer)) continue;
        // Skip if it's just a command like /вопрос
        if (answer.startsWith('/') && answer.length < 20) continue;
        // Skip duplicates within new batch
        if (newExamples.includes(answer)) continue;

        newExamples.push(answer);
        existingExamples.add(answer);
    }

    if (newExamples.length === 0) {
        console.log('✅ No new unique examples to add.');
        return;
    }

    // Append new examples to the end of the prompt
    const newLines = newExamples.map(a => `- "${a.replace(/"/g, '\\"')}"`).join('\n');
    prompt = prompt.trimEnd() + '\n' + newLines + '\n';

    // Write updated prompt
    fs.writeFileSync(PROMPT_FILE, prompt, 'utf8');
    console.log(`✅ Added ${newExamples.length} new examples to prompt!`);
    console.log(`📝 Total examples now: ${existingExamples.size}`);

    // Show a few examples
    console.log('\n🆕 New examples:');
    for (const ex of newExamples.slice(0, 10)) {
        console.log(`  - "${ex.slice(0, 80)}${ex.length > 80 ? '...' : ''}"`);
    }
    if (newExamples.length > 10) {
        console.log(`  ... and ${newExamples.length - 10} more`);
    }
}

run();
