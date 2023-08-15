import fs from 'fs';
import os from 'os';

function setEnvValue(key: string, value: string) {

    // read file from hdd & split if from a linebreak to a array
    let envVars = fs.readFileSync("./.env", "utf8").split(os.EOL);
    let keyExists = false;

    envVars = envVars.map((line) => {
        const lineKey = line.split("=")[0];
        let lineValue = line.split("=")[1];

        if (key === lineKey) {
            lineValue = value;
            keyExists = true;
        }
        return `${lineKey}=${lineValue}`;
    })

    if (!keyExists) {
        envVars.push(`${key}=${value}`);
    }

    // write everything back to the file system
    fs.writeFileSync("./.env", envVars.join(os.EOL));
}

export { setEnvValue };