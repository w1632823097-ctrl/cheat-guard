{
  "targets": [
    {
      "target_name": "wda_addon",
      "sources": ["wda_addon.cc"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": ["<!(node -p \"require('node-addon-api').gyp\")"],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "conditions": [
        ["OS=='win'", {
          "libraries": ["-luser32.lib"]
        }]
      ]
    }
  ]
}
