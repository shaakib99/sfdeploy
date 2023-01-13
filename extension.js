// import * as jsforce from "jsforce";
// import * as diff from "diff";
// import { ZipFile } from "jsforce-metadata-tools";
// import * as fs from "fs";
// import * as xml2js from "xml2js";
// import { SfProject } from '@salesforce/core';

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require("vscode");
const jsforce = require("jsforce");
// const { RetrieveResult } = require("jsforce-metadata-tools");
const zlib = require("zlib");
const diff = require("diff");
const fs = require("fs");
const xml2js = require("xml2js");
const { AuthInfo, Org, SfProject, Connection } = require("@salesforce/core");

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  let disposable = vscode.commands.registerCommand(
    "salesforceDeploy.deploy",
    async () => {
      const readXml = async (path) => {
        return new Promise((resolve, reject) => {
          fs.readFile(path, "utf8", (err, data) => {
            if (err) {
              reject(err);
            } else {
              xml2js.parseString(data, (err, result) => {
                if (err) {
                  reject(err);
                } else {
                  resolve(result);
                }
              });
            }
          });
        });
      };

      // Get package name and api version
      const packageXml = await readXml("./manifest/package.xml");
      const packageName = packageXml.Package.types[0].name[0];
      const apiVersion = packageXml.Package.$.version;

      // Get Auth data
      const authList = await AuthInfo.listAllAuthorizations();

      if (!authList.length)
        return vscode.window.showInformationMessage(
          "Authorization data not found. Please authorize an org first."
        );

      // Get auth info for current project
      const project = await SfProject.resolve();
      const selectedOrgData = JSON.parse(
        JSON.stringify(await project.resolveProjectConfig())
      );
      const currentAuthInfo = authList.find((af) =>
        af.aliases.includes(selectedOrgData["target-org"])
      );

      // Connect to Salesforce
      const options = {
        // loginUrl: "https://login.salesforce.com",
        instanceUrl: currentAuthInfo.instanceUrl,
        accessToken: currentAuthInfo.accessToken,
        username: currentAuthInfo.username,
        // refreshToken: orgData.
      };

      const conn = new jsforce.Connection(options);

      // Get the current file
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage("No file is currently open.");
        return;
      }
      const fileUri = editor.document.uri;

      // Pull the file from Salesforce
      //   const file = await conn.metadata.read("ApexClass", fileUri.fsPath);
      const retrieveRequest = {
        packageNames: Array.from(
          new Set(
            (await conn.metadata.list({ type: "ApexClass" })).map(
              (pkg) => pkg.fullName
            )
          )
        ),
        singlePackage: false,
        specificFiles: [fileUri.fsPath],
        apiVersion: "55.0",
      };
      vscode.window.showInformationMessage(
        "HELLO " + JSON.stringify(retrieveRequest)
      );

      const result = await conn.metadata.retrieve(retrieveRequest);
      const zip = await conn.metadata.checkRetrieveStatus(result.id);
      vscode.window.showInformationMessage("HELLO " + JSON.stringify(zip));

      const buffer = new Buffer.from(zip.zipFile, "base64");
      //   const remoteText = zip.fileProperties[0].fileContent;

      //   vscode.window.showInformationMessage(JSON.stringify(retrieveResult));

      //   const file = new ZipFile(result.zipFile);
      //   console.log(zipFile.fileProperties[0].fileContent);

      // Compare the local and remote versions of the file
      const localText = editor.document.getText();
      let remoteText = "";
      zlib.gunzip(buffer, (err, res) => (remoteText = res.toString()));
      const changes = diff.diffLines(localText, remoteText);

      // Show a message with the changes
      let message = "Changes:\n";
      for (const change of changes) {
        if (change.added) {
          message += `\n+ ${change.value}`;
        } else if (change.removed) {
          message += `\n- ${change.value}`;
        }
      }

      // Ask for confirmation to continue
      const choice = await vscode.window.showInformationMessage(
        message,
        "Continue",
        "Abort"
      );
      if (choice === "Abort") {
        return;
      }

      // Deploy the file to Salesforce
      const zipInput = fs.createReadStream(fileUri.fsPath);
      const deploymentOptions = {
        rollbackOnError: true,
        checkOnly: false,
        testLevel: "RunSpecifiedTests",
        runTests: [],
      };
      conn.metadata.deploy(zipInput, deploymentOptions).complete((err, res) => {
        if (err) {
          vscode.window.showErrorMessage(
            "Failed to deploy file: " + err.message
          );
        } else {
          vscode.window.showInformationMessage("File successfully deployed.");
        }
      });
    }
  );
  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
