#!/usr/bin/env node
/**
 * Alibaba infra helpers: ACR, VPC security group, FC URL, Serverless Devs access.
 */
import https from "node:https";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REGION = process.env.ALIBABA_REGION || "ap-southeast-1";
const ACCOUNT_ID = process.env.ALIBABA_ACCOUNT_ID || "5808683449843901";
const ACCESS_KEY_ID = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID;
const ACCESS_KEY_SECRET = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET;

if (!ACCESS_KEY_ID || !ACCESS_KEY_SECRET) {
  console.error("Missing ALIBABA_CLOUD_ACCESS_KEY_ID / ALIBABA_CLOUD_ACCESS_KEY_SECRET");
  process.exit(1);
}

function sign(method, params, secret) {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join("&");
  const stringToSign = `${method}&${encodeURIComponent("/")}&${encodeURIComponent(sorted)}`;
  return crypto.createHmac("sha1", `${secret}&`).update(stringToSign).digest("base64");
}

function rpc(host, action, version, region, extra = {}) {
  return new Promise((resolve, reject) => {
    const params = {
      Action: action,
      Format: "JSON",
      Version: version,
      AccessKeyId: ACCESS_KEY_ID,
      SignatureMethod: "HMAC-SHA1",
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      SignatureVersion: "1.0",
      SignatureNonce: crypto.randomBytes(16).toString("hex"),
      RegionId: region,
      ...extra,
    };
    params.Signature = sign("GET", params, ACCESS_KEY_SECRET);
    const qs = Object.keys(params)
      .sort()
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
      .join("&");
    https
      .get({ hostname: host, path: `/?${qs}`, timeout: 60000 }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(data.slice(0, 800)));
          }
        });
      })
      .on("error", reject);
  });
}

function fail(body) {
  if (body?.Code && !["Success", "200", "success", "EntityAlreadyExists.Role", "EntityAlreadyExists.Role.Policy"].includes(body.Code)) {
    throw new Error(`${body.Code}: ${body.Message || body.message || JSON.stringify(body)}`);
  }
}

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
const cmd = args[0];

async function ensureAcr() {
  const list = await rpc(`cr.${REGION}.aliyuncs.com`, "ListInstance", "2018-12-01", REGION, {
    PageNo: "1",
    PageSize: "20",
  });
  fail(list);
  const existing = list.Instances?.[0];
  if (existing) {
    return { instanceId: existing.InstanceId, status: existing.InstanceStatus };
  }
  const created = await rpc(`cr.${REGION}.aliyuncs.com`, "CreateInstance", "2018-12-01", REGION, {
    InstanceName: "qwen-memory-cr",
    InstanceSpecification: "Enterprise_Basic",
  });
  fail(created);
  return { instanceId: created.InstanceId, status: "Creating" };
}

async function waitAcrReady(instanceId) {
  for (let i = 0; i < 30; i++) {
    const list = await rpc(`cr.${REGION}.aliyuncs.com`, "ListInstance", "2018-12-01", REGION, {
      PageNo: "1",
      PageSize: "20",
    });
    const inst = list.Instances?.find((x) => x.InstanceId === instanceId);
    if (inst?.InstanceStatus === "RUNNING") return inst;
    await new Promise((r) => setTimeout(r, 10000));
  }
  throw new Error("ACR instance not RUNNING in time");
}

async function ensureAcrRepo(instanceId, namespace, repo) {
  await waitAcrReady(instanceId);
  try {
    await rpc(`cr.${REGION}.aliyuncs.com`, "CreateNamespace", "2018-12-01", REGION, {
      InstanceId: instanceId,
      NamespaceName: namespace,
    });
  } catch (e) {
    if (!String(e.message).includes("NAMESPACE_ALREADY_EXIST")) throw e;
  }
  try {
    await rpc(`cr.${REGION}.aliyuncs.com`, "CreateRepository", "2018-12-01", REGION, {
      InstanceId: instanceId,
      NamespaceName: namespace,
      RepoName: repo,
      RepoType: "PRIVATE",
      Summary: "qwen-memory-mcp",
    });
  } catch (e) {
    if (!String(e.message).includes("REPO_ALREADY_EXIST")) throw e;
  }
  return { namespace, repo };
}

async function acrLogin(instanceId) {
  const token = await rpc(`cr.${REGION}.aliyuncs.com`, "GetAuthorizationToken", "2018-12-01", REGION, {
    InstanceId: instanceId,
  });
  fail(token);
  return {
    username: token.TempUsername,
    password: token.AuthorizationToken,
    loginServer: `cr.${REGION}.aliyuncs.com`,
  };
}

async function ensureSecurityGroup(vpcId, name, region) {
  const existing = await rpc(`ecs.${region}.aliyuncs.com`, "DescribeSecurityGroups", "2014-05-26", region, {
    VpcId: vpcId,
    SecurityGroupName: name,
    PageSize: "50",
  });
  fail(existing);
  const sg = existing.SecurityGroups?.SecurityGroup?.find((s) => s.SecurityGroupName === name);
  if (sg) return { securityGroupId: sg.SecurityGroupId };
  const created = await rpc(`ecs.${region}.aliyuncs.com`, "CreateSecurityGroup", "2014-05-26", region, {
    VpcId: vpcId,
    SecurityGroupName: name,
    Description: "FC egress to RDS for qwen-memory-mcp",
  });
  fail(created);
  return { securityGroupId: created.SecurityGroupId };
}

function writeSAccess(region) {
  const accessPath = path.join(os.homedir(), ".s", "access.yaml");
  fs.mkdirSync(path.dirname(accessPath), { recursive: true });
  const content = `default:
  AccessKeyID: ${ACCESS_KEY_ID}
  AccessKeySecret: ${ACCESS_KEY_SECRET}
  AccountID: ${ACCOUNT_ID}
  Region: ${region}
`;
  fs.writeFileSync(accessPath, content, { mode: 0o600 });
  return { accessPath };
}

async function ensureFcVpcRole() {
  const roleName = "qwenMemoryFcVpcRole";
  const trust = {
    Statement: [
      {
        Action: "sts:AssumeRole",
        Effect: "Allow",
        Principal: { Service: "fc.aliyuncs.com" },
      },
    ],
    Version: "1",
  };
  const created = await rpc("ram.aliyuncs.com", "CreateRole", "2015-05-01", "cn-hangzhou", {
    RoleName: roleName,
    AssumeRolePolicyDocument: JSON.stringify(trust),
    Description: "FC VPC access for qwen-memory-mcp",
  });
  if (created.Code && !["EntityAlreadyExists.Role", "Success"].includes(created.Code)) {
    throw new Error(`${created.Code}: ${created.Message}`);
  }
  for (const policy of [
    "AliyunFCDefaultRolePolicy",
    "AliyunECSNetworkInterfaceManagementAccess",
    "AliyunVPCReadOnlyAccess",
  ]) {
    const attached = await rpc("ram.aliyuncs.com", "AttachPolicyToRole", "2015-05-01", "cn-hangzhou", {
      RoleName: roleName,
      PolicyType: "System",
      PolicyName: policy,
    });
    if (attached.Code && !["EntityAlreadyExists.Role.Policy", "Success"].includes(attached.Code)) {
      throw new Error(`${attached.Code}: ${attached.Message}`);
    }
  }
  return { roleArn: `acs:ram::${ACCOUNT_ID}:role/${roleName}` };
}

async function printFcUrl(functionName, region) {
  const info = await rpc(`fcv3.${region}.aliyuncs.com`, "ListTriggers", "2023-03-30", region, {
    functionName,
  }).catch(() => null);

  if (info?.triggers?.length) {
    const http = info.triggers.find((t) => t.triggerType === "http");
    const url = http?.httpTrigger?.urlInternet || http?.triggerConfig?.urlInternet;
    if (url) {
      console.log(JSON.stringify({ url: url.replace(/\/$/, "") }));
      return;
    }
  }

  // FC3 default public URL pattern (fallback)
  const url = `https://${functionName}-zvztgdreaw.${region}.fcapp.run`;
  console.log(JSON.stringify({ url, note: "update-after-first-deploy-if-wrong" }));
}

try {
  let result;
  switch (cmd) {
    case "ensure-acr":
      result = await ensureAcr();
      break;
    case "ensure-acr-repo":
      result = await ensureAcrRepo(arg("--instance"), arg("--namespace"), arg("--repo"));
      break;
    case "acr-login":
      result = await acrLogin(arg("--instance"));
      break;
    case "ensure-security-group":
      result = await ensureSecurityGroup(arg("--vpc"), arg("--name"), arg("--region") || REGION);
      break;
    case "ensure-fc-vpc-role":
      result = await ensureFcVpcRole();
      break;
    case "write-s-access":
      result = writeSAccess(arg("--region") || REGION);
      break;
    case "print-fc-url":
      await printFcUrl(arg("--function"), arg("--region") || REGION);
      process.exit(0);
    default:
      console.error(`Unknown command: ${cmd}`);
      process.exit(1);
  }
  console.log(JSON.stringify(result));
} catch (err) {
  console.error(String(err.message || err));
  process.exit(1);
}
