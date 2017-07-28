'use strict'

/* global describe, it */
const nextUpdateTravis = require('.')

describe('next-update-travis', () => {
  it('loads successfully', () => {
    console.assert(typeof nextUpdateTravis === 'function')
  })
})
