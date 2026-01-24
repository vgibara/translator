import { extractStrings, reconstructJson } from './json-traversal.js';

const testJson = {
  title: "Hello World",
  nested: {
    description: "This is a test",
    tags: ["one", "two"]
  },
  items: [
    { name: "Item 1" },
    { name: "Item 2" }
  ]
};

const nodes = extractStrings(testJson);
console.log("Extracted nodes:", JSON.stringify(nodes, null, 2));

const translatedNodes = nodes.map(node => ({
  ...node,
  value: node.value + " (translated)"
}));

const result = reconstructJson(testJson, translatedNodes);
console.log("Reconstructed JSON:", JSON.stringify(result, null, 2));

if (result.title === "Hello World (translated)" && result.nested.tags[0] === "one (translated)") {
  console.log("TEST PASSED");
} else {
  console.log("TEST FAILED");
  process.exit(1);
}
