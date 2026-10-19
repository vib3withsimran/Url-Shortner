const { connectLambda } = require("@netlify/blobs");
const serverless = require("serverless-http");
const app = require("../../index.js");

const expressHandler = serverless(app);

module.exports.handler = async (event, context) => {
  // serverless-http runs under the Lambda compatibility mode, where Netlify
  // does NOT auto-configure Blobs. Binding the event here is what makes
  // getStore() work inside store.js (MissingBlobsEnvironmentError otherwise).
  // Plain AWS/local-style events (e.g. tests) without a Netlify payload are
  // ignored gracefully.
  try {
    connectLambda(event);
  } catch (err) {
    // Never silently: this is exactly the failure mode that leaves Blobs
    // unconfigured and produces opaque 500s downstream.
    console.error(
      "[api] connectLambda failed (runtime may not have injected event.blobs):",
      err && err.message,
      "\nevent keys:",
      Object.keys(event || {}).join(",")
    );
  }
  return expressHandler(event, context);
};
