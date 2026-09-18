#!/usr/bin/env node
/**
 * Stands in for `browser-web3-signer serve`: prints its port on stdout (the contract
 * `ServeProcess` waits on), then echoes each control-API request body back as the result, so a
 * test can assert exactly what the shim put on the wire.
 *
 * A request carrying `"__reject__"` comes back as a wrong-wallet rejection instead.
 */
import { createServer } from "node:http";

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");

    if (body.includes("__reject__")) {
      res.statusCode = 409;
      res.end(JSON.stringify({ success: false, error: "wrong account", code: "WRONG_WALLET_ADDRESS" }));
      return;
    }

    // deploy_contract is the one call whose result the shim parses rather than passes through.
    const result = JSON.parse(body).type === "deploy_contract"
      ? JSON.stringify({ txHash: "0xdeadbeef", contractAddress: "TDeployed" })
      : body;
    res.end(JSON.stringify({ success: true, result }));
  });
});

server.listen(0, "127.0.0.1", () => console.log(server.address().port));
