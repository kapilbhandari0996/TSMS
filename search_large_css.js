const fs = require('fs');
const readline = require('readline');
const path = require('path');

const brainsDir = 'C:/Users/Kapil/.gemini/antigravity-ide/brain';
const brainDirs = fs.readdirSync(brainsDir);

async function search() {
    let bestContent = null;
    let latestTime = 0;

    for (const d of brainDirs) {
        const transcriptPath = path.join(brainsDir, d, '.system_generated/logs/transcript_full.jsonl');
        if (!fs.existsSync(transcriptPath)) continue;

        const fileStream = fs.createReadStream(transcriptPath);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

        for await (const line of rl) {
            try {
                const step = JSON.parse(line);
                if (step.type === 'PLANNER_RESPONSE' && step.tool_calls) {
                    for (const tool of step.tool_calls) {
                        if (tool.name === 'write_to_file' || tool.name === 'write_file') {
                            if (tool.args && tool.args.TargetFile && tool.args.TargetFile.toLowerCase().includes('styles.css')) {
                                if (tool.args.CodeContent.length > 20000) {
                                    bestContent = tool.args.CodeContent;
                                    console.log('Found large styles.css in ' + d + ' length: ' + tool.args.CodeContent.length);
                                }
                            }
                        }
                    }
                }
            } catch(e) {}
        }
    }
    
    if (bestContent) {
        fs.writeFileSync('c:/Users/Kapil/Downloads/POC/frontend/styles.css', bestContent);
        console.log('Restored large styles.css');
    }
}
search();
