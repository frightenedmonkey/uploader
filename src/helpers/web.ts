import { snakeCase } from 'snake-case'
import fetch from 'node-fetch'

import { version } from '../../package.json'
import {
  IRequestHeaders,
  IServiceParams,
  PostResults,
  PutResults,
  UploaderArgs,
  UploaderInputs,
} from '../types'
import { info } from './logger'
import * as validateHelpers from './validate'
import { HttpsProxyAgent } from 'https-proxy-agent'

/**
 *
 * @param {Object} inputs
 * @param {NodeJS.ProcessEnv} inputs.envs
 * @param {Object} serviceParams
 * @returns Object
 */
export function populateBuildParams(
  inputs: UploaderInputs,
  serviceParams: Partial<IServiceParams>,
): Partial<IServiceParams> {
  const { args, environment: envs } = inputs
  serviceParams.name = args.name || envs.CODECOV_NAME || ''
  serviceParams.tag = args.tag || ''

  let flags: string[]
  if (typeof args.flags === 'object') {
    flags = [...args.flags]
  } else {
    flags = String(args.flags || '').split(',')
  }
  serviceParams.flags = flags
    .filter(flag => validateHelpers.validateFlags(flag))
    .join(',')

  serviceParams.parent = args.parent || ''
  return serviceParams
}

export function getPackage(source: string): string {
  if (source) {
    return `${source}-uploader-${version}`
  } else {
    return `uploader-${version}`
  }
}


export async function uploadToCodecovPUT(
  putAndResultUrlPair: PostResults, 
  uploadFile: string | Buffer,
  args: UploaderArgs
): Promise<PutResults> {
  info('Uploading...')

  const requestHeaders = generateRequestHeadersPUT(
    putAndResultUrlPair.putURL,
    uploadFile,
    args,
  )
  const response = await fetch(requestHeaders.url, requestHeaders.options)

  if (response.status !== 200) {
    const data = await response.text()
    throw new Error(
      `There was an error fetching the storage URL during PUT: ${response.status} - ${response.statusText} - ${data}`,
    )
  }

  return { status: 'success', resultURL: putAndResultUrlPair.resultURL }
}

export async function uploadToCodecovPOST(
  postURL: URL,
  token: string,
  query: string,
  source: string,
  args: UploaderArgs,
): Promise<string> {
  const requestHeaders = generateRequestHeadersPOST(
    postURL,
    token,
    query,
    source,
    args,
  )
  const response = await fetch(requestHeaders.url, requestHeaders.options)

  if (response.status !== 200) {
    const data = await response.text()
    throw new Error(
      `There was an error fetching the storage URL during POST: ${response.status} - ${response.statusText} - ${data}`,
    )
  }

  return await response.text()
}

/**
 *
 * @param {Object} queryParams
 * @returns {string}
 */
export function generateQuery(queryParams: Partial<IServiceParams>): string {
  return new URLSearchParams(
    Object.entries(queryParams).map(([key, value]) => [snakeCase(key), value]),
  ).toString()
}



export function parsePOSTResults(putAndResultUrlPair: string): PostResults {
  info(putAndResultUrlPair)

  // JS for [[:graph:]] https://www.regular-expressions.info/posixbrackets.html
  const re = /([\x21-\x7E]+)[\r\n]?/gm

  const matches = putAndResultUrlPair.match(re)

  if (matches === null) {
    throw new Error(`Parsing results from POST failed: (${putAndResultUrlPair})`)
  }

  if (matches?.length !== 2) {
    throw new Error(
      `Incorrect number of urls when parsing results from POST: ${matches.length}`,
    )
  }

  const resultURL = new URL(matches[0].trimEnd())
  const putURL = new URL(matches[1])
   // This match may have trailing 0x0A and 0x0D that must be trimmed

  return { putURL, resultURL }
}

export function displayChangelog(): void {
  info(`The change log for this version (v${version}) can be found at`)
  info(`https://github.com/codecov/uploader/blob/v${version}/CHANGELOG.md`)
}

export function generateRequestHeadersPOST(
  postURL: URL,
  token: string,
  query: string,
  source: string,
  args: UploaderArgs,
): IRequestHeaders {
    if (args.upstream !== '') {
      const proxyAgent = new HttpsProxyAgent(args.upstream)
      return {
        url: new URL(`/upload/v4?package=${getPackage(
          source,
        )}&token=${token}&${query}`, postURL),
        options: {
          agent: proxyAgent,
          method: 'post',
          headers: {
            'X-Upload-Token': token,
            'X-Reduced-Redundancy': 'false',
          },
        },
      }
    }

    return {
      url: new URL(`/upload/v4?package=${getPackage(
        source,
      )}&token=${token}&${query}`, postURL),
      options: {
        method: 'post',
        headers: {
          'X-Upload-Token': token,
          'X-Reduced-Redundancy': 'false',
        },
      },
    }
}

export function generateRequestHeadersPUT(
  uploadURL: URL,
  uploadFile: string | Buffer,
  args: UploaderArgs,
): IRequestHeaders {

    if (args.upstream !== '') {
      const proxyAgent = new HttpsProxyAgent(args.upstream)
      return {
        url: uploadURL,
        options: {
          method: 'put',
          agent: proxyAgent,
          body: uploadFile,
          headers: {
            'Content-Type': 'text/plain',
            'Content-Encoding': 'gzip',
          },
        },
      }
    }
    return {
      url: uploadURL, options: {
        method: 'put',
        body: uploadFile,
        headers: {
          'Content-Type': 'text/plain',
          'Content-Encoding': 'gzip',
        },
      }

    }
  
}
