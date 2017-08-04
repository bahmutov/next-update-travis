#!/usr/bin/env node

'use strict'

const debug = require('debug')('next-update-travis')
const amIaDependency = require('am-i-a-dependency')
const isForced = process.argv.some(a => a === '--force')

function verifyIsNotSelfInstall () {
  if (!amIaDependency() && !isForced) {
    // top level install (we are running `npm i` in this project)
    debug('we are installing own dependencies')
    process.exit(0)
  }
  debug('installing this module as a dependency')
}

const join = require('path').join
const fs = require('fs')
const stripIndent = require('common-tags').stripIndent
const execa = require('execa')
const gh = require('parse-github-url')

function getOriginUrl () {
  return execa.shell('git remote get-url origin')
    .then(response => response.stdout)
    .then(s => s.trim())
}

function getScript (originUrl) {
  debug('origin url', originUrl)
  const parsed = gh(originUrl)
  const tokenUrl = `https://next-update:$GH_TOKEN@github.com/${parsed.repo}.git`
  debug('token url', tokenUrl)

  const script = stripIndent`
  #!/bin/bash

  set -e

  if [ "$TRAVIS_EVENT_TYPE" = "cron" ]; then
    if [ "$GH_TOKEN" = "" ]; then
      echo ""
      echo "⛔️ Cannot find environment variable GH_TOKEN ⛔️"
      echo "Please set it up for this script to be able"
      echo "to push results to GitHub"
      echo "ℹ️ The best way is to use semantic-release to set it up"
      echo ""
      echo "  https://github.com/semantic-release/semantic-release"
      echo ""
      echo "npm i -g semantic-release-cli"
      echo "semantic-release-cli setup"
      echo ""
      exit 1
    fi

    echo "Upgrading dependencies using next-update"
    npm i -g next-update

    # you can edit options to allow only some updates
    # --allow major | minor | patch
    # --latest true | false
    # see all options by installing next-update
    # and running next-update -h
    next-update --allow minor --latest false

    git status
    # if package.json is modified we have
    # new upgrades
    if git diff --name-only | grep package.json > /dev/null; then
      echo "There are new versions of dependencies 💪"
      git add package.json
      echo "----------- package.json diff -------------"
      git diff --staged
      echo "-------------------------------------------"
      git config --global user.email "next-update@ci.com"
      git config --global user.name "next-update"
      git commit -m "chore(deps): upgrade dependencies using next-update"
      # push back to GitHub using token
      git remote remove origin
      # TODO read origin from package.json
      # or use github api module github
      # like in https://github.com/semantic-release/semantic-release/blob/caribou/src/post.js
      git remote add origin ${tokenUrl}
      git push origin HEAD:master
    else
      echo "No new versions found ✋"
    fi
  else
    echo "Not a cron job, normal test"
  fi
  `
  return script
}

const scriptName = 'next-update-travis.sh'

function fullScriptFilename (filename) {
  return join(process.cwd(), '..', '..', filename)
}

function alreadyInstalled (filename) {
  return fs.existsSync(fullScriptFilename(filename))
}

function verifyNotInstalled () {
  if (alreadyInstalled(scriptName)) {
    debug('output file %s already exists', scriptName)
    process.exit(0)
  }
}

function saveScript (filename, script) {
  const outputFilename = join(process.cwd(), '..', '..', filename)
  debug('writing script %s', outputFilename)
  fs.writeFileSync(outputFilename, script + '\n', 'utf8')
  debug('setting read / write / execute permissions')
  // 511 is same as 0777 in octal, which is -rwxrwxrwx
  fs.chmodSync(outputFilename, 511)
}

function showSuccessMessage (scriptName) {
  const msg = stripIndent`
  ==================================================================
  🎉                                                               🎉
  🎉  you have installed next-update TravisCI helper               🎉
  🎉  The simplest way to ensure your dependencies are up to date. 🎉
  🎉                                                               🎉
  ==================================================================

  - you need GH_TOKEN environment variable to push package.json updates
    I recommend using semantic-release:
      https://github.com/semantic-release/semantic-release
  - Turn on TravisCI CRON job https://docs.travis-ci.com/user/cron-jobs/
  - Add '${scriptName}' command to .travis.yml file like this

  script:
    - ./${scriptName}
    - npm test

  - edit file ${scriptName} to set specific upgrade options

  👍  Zero noise
  👍  Trivial to setup
  👍  Up to date dependencies

  Optional: add this badge to the README.md file
  (change weekly to your Travis CRON job perod)

  [![next-update-travis badge][nut-badge]][nut-readme]
  [nut-badge]: https://img.shields.io/badge/next--update--travis-weekly-green.svg
  [nut-readme]: https://github.com/bahmutov/next-update-travis#readme

  For more details visit https://github.com/bahmutov/next-update-travis
  `
  console.log(msg)
}

function postInstall () {
  return getOriginUrl()
    .then(getScript)
    .then(saveScript.bind(null, scriptName))
}

if (module.parent) {
  module.exports = postInstall
} else {
  verifyIsNotSelfInstall()
  verifyNotInstalled()
  postInstall()
    .then(() => showSuccessMessage(scriptName))
    .catch(err => {
      console.error('🔥  something went wrong')
      console.error(err.message)
      process.exit(1)
    })
}
