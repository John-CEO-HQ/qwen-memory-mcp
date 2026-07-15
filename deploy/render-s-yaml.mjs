#!/usr/bin/env node
/** Render s.resolved.yaml with concrete values (no runtime env interpolation). */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  if (i < 0) throw new Error(`Missing ${name}`);
  return args[i + 1];
}

const mode = arg("--mode");
const out = arg("--out");
const region = arg("--region");

const envBlock = `      environmentVariables:
        MCP_TRANSPORT: http
        PORT: "8080"
        MEMORY_STORE: mysql
        MYSQL_HOST: ${JSON.stringify(arg("--mysql-host"))}
        MYSQL_PORT: "3306"
        MYSQL_USER: ${JSON.stringify(arg("--mysql-user"))}
        MYSQL_PASSWORD: ${JSON.stringify(arg("--mysql-password"))}
        MYSQL_DATABASE: ${JSON.stringify(arg("--mysql-database"))}
        QWEN_API_KEY: ${JSON.stringify(arg("--qwen-key"))}
        QWEN_BASE_URL: ${JSON.stringify(arg("--qwen-base"))}
        QWEN_CHAT_MODEL: ${JSON.stringify(arg("--qwen-chat"))}
        QWEN_EMBEDDING_MODEL: ${JSON.stringify(arg("--qwen-embed"))}
        MCP_AUTH_TOKEN: ${JSON.stringify(arg("--mcp-token"))}`;

const vpcBlock = `      role: ${JSON.stringify(arg("--role-arn"))}
      vpcConfig:
        vpcId: ${JSON.stringify(arg("--vpc"))}
        vSwitchIds:
          - ${JSON.stringify(arg("--vswitch"))}
        securityGroupId: ${JSON.stringify(arg("--sg"))}`;

const triggersBlock = `      triggers:
        - triggerName: httpTrigger
          triggerType: http
          triggerConfig:
            authType: anonymous
            disableURLInternet: false
            methods:
              - GET
              - POST`;

let runtimeBlock;
let codeLine;

if (mode === "custom-runtime") {
  const codeDir = path.resolve(arg("--code-dir"));
  runtimeBlock = `      runtime: custom.debian10
      cpu: 0.5
      memorySize: 512
      diskSize: 512
      timeout: 60
      instanceConcurrency: 1
      customRuntimeConfig:
        command:
          - ./bootstrap
        args: []
        port: 8080`;
  codeLine = `      code: ${JSON.stringify(codeDir)}`;
} else {
  runtimeBlock = `      runtime: custom-container
      cpu: 0.5
      memorySize: 512
      diskSize: 512
      timeout: 60
      instanceConcurrency: 1
      customContainerConfig:
        image: ${JSON.stringify(arg("--image"))}
        port: 8080`;
  codeLine = "";
}

const yaml = `edition: 3.0.0
name: qwen-memory-mcp
access: default

vars:
  region: ${region}
  functionName: qwen-memory-mcp

resources:
  qwen_memory_mcp:
    component: fc3
    props:
      region: \${vars.region}
      functionName: \${vars.functionName}
      description: Qwen Memory MCP hackathon backend (HTTP + MySQL on RDS)
${runtimeBlock}
${codeLine}
${envBlock}
${vpcBlock}
${triggersBlock}
`;

fs.writeFileSync(out, yaml);
console.log(`render-s-yaml: wrote ${out} (${mode})`);
