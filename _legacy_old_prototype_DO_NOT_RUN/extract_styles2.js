const fs = require('fs');
const readline = require('readline');

async function extractStyles() {
    const transcriptPath = 'C:/Users/Kapil/.gemini/antigravity-ide/brain/dfa523af-e365-4cac-be14-b45ed4f7b6d1/.system_generated/logs/transcript_full.jsonl';
    const fileStream = fs.createReadStream(transcriptPath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let finalContent = null;

    for await (const line of rl) {
        try {
            const step = JSON.parse(line);
            if (step.step_index >= 691) break;

            if (step.type === 'PLANNER_RESPONSE' && step.tool_calls) {
                for (const tool of step.tool_calls) {
                    if (tool.args && tool.args.TargetFile && tool.args.TargetFile.toLowerCase().includes('styles.css')) {
                        if (tool.name === 'write_to_file' || tool.name === 'write_file') {
                            finalContent = tool.args.CodeContent;
                        } else if (tool.name === 'replace_file_content' && finalContent) {
                            finalContent = finalContent.replace(tool.args.TargetContent, tool.args.ReplacementContent);
                        } else if (tool.name === 'multi_replace_file_content' && finalContent) {
                            for (const chunk of tool.args.ReplacementChunks) {
                                finalContent = finalContent.replace(chunk.TargetContent, chunk.ReplacementContent);
                            }
                        }
                    }
                }
            }
        } catch(e) {}
    }
    
    if (finalContent) {
        fs.writeFileSync('C:/Users/Kapil/Downloads/POC/frontend/styles.css', finalContent);
        console.log('Restored styles.css, length: ' + finalContent.length);
    } else {
        console.log('Could not find write_to_file for styles.css');
    }
}
extractStyles();
