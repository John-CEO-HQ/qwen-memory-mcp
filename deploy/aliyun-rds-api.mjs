#!/usr/bin/env node
/**
 * Minimal Alibaba RDS OpenAPI helper for bootstrap-rds.sh
 */
import https from "node:https";
import crypto from "node:crypto";

const REGION = process.env.ALIBABA_REGION || process.env.RDS_REGION || "ap-southeast-1";
const DB_INSTANCE_ID = process.env.RDS_INSTANCE_ID || "rm-gs56bv9zf5g03q9td";
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

function rpc(action, extra = {}) {
  return new Promise((resolve, reject) => {
    const params = {
      Action: action,
      Format: "JSON",
      Version: "2014-08-15",
      AccessKeyId: ACCESS_KEY_ID,
      SignatureMethod: "HMAC-SHA1",
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      SignatureVersion: "1.0",
      SignatureNonce: crypto.randomBytes(16).toString("hex"),
      RegionId: REGION,
      DBInstanceId: DB_INSTANCE_ID,
      ...extra,
    };
    params.Signature = sign("GET", params, ACCESS_KEY_SECRET);
    const qs = Object.keys(params)
      .sort()
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
      .join("&");
    https
      .get({ hostname: `rds.${REGION}.aliyuncs.com`, path: `/?${qs}`, timeout: 30000 }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const body = JSON.parse(data);
            if (body.Code && body.Code !== "Success" && body.Code !== "200") {
              reject(new Error(`${body.Code}: ${body.Message}`));
              return;
            }
            resolve(body);
          } catch {
            reject(new Error(data.slice(0, 500)));
          }
        });
      })
      .on("error", reject);
  });
}

const cmd = process.argv[2];
const args = process.argv.slice(3);

function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

try {
  let result;
  switch (cmd) {
    case "describe-accounts":
      result = await rpc("DescribeAccounts");
      break;
    case "describe-databases":
      result = await rpc("DescribeDatabases");
      break;
    case "describe-net-info":
      result = await rpc("DescribeDBInstanceNetInfo");
      break;
    case "create-account":
      result = await rpc("CreateAccount", {
        AccountName: arg("--name"),
        AccountPassword: arg("--password"),
        AccountType: arg("--type") || "Normal",
      });
      break;
    case "create-database":
      result = await rpc("CreateDatabase", {
        DBName: arg("--name"),
        CharacterSetName: "utf8mb4",
      });
      break;
    case "grant-privilege":
      result = await rpc("GrantAccountPrivilege", {
        AccountName: arg("--account"),
        DBName: arg("--database"),
        AccountPrivilege: arg("--privilege") || "ReadWrite",
      });
      break;
    case "allocate-public-connection":
      result = await rpc("AllocateInstancePublicConnection", {
        ConnectionStringPrefix: arg("--prefix") || "qwenmemory",
        Port: "3306",
      });
      break;
    case "modify-security-ips":
      result = await rpc("ModifySecurityIps", {
        SecurityIps: arg("--whitelist"),
        DBInstanceIPArrayName: "default",
        ModifyMode: "Cover",
      });
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      process.exit(1);
  }
  console.log(JSON.stringify(result));
} catch (err) {
  console.error(String(err.message || err));
  process.exit(1);
}
