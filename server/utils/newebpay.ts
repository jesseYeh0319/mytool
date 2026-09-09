import {
  createCipheriv,
  createDecipheriv,
  createHash,
  timingSafeEqual,
} from 'node:crypto'

type NewebpayTradeParams = Record<
  string,
  string | number
>

export function createNewebpayTrade(
  params: NewebpayTradeParams,
  hashKey: string,
  hashIv: string,
) {
  const key = Buffer.from(hashKey, 'utf8')
  const iv = Buffer.from(hashIv, 'utf8')

  if (key.length !== 32 || iv.length !== 16) {
    throw new Error(
      '藍新金鑰設定錯誤：HashKey 必須為 32 bytes，HashIV 必須為 16 bytes。'
    )
  }

  // 將交易參數轉成 URL 編碼字串。
  const searchParams = new URLSearchParams()

  for (const [name, value] of Object.entries(params)) {
    searchParams.append(name, String(value))
  }

  // Node.js 預設會加入 PKCS7 padding，不需自行補齊。
  const cipher = createCipheriv(
    'aes-256-cbc',
    key,
    iv,
  )

  const tradeInfo = Buffer.concat([
    cipher.update(searchParams.toString(), 'utf8'),
    cipher.final(),
  ]).toString('hex')

  const tradeSha = createHash('sha256')
    .update(
      `HashKey=${hashKey}&${tradeInfo}&HashIV=${hashIv}`,
      'utf8',
    )
    .digest('hex')
    .toUpperCase()

  return {
    TradeInfo: tradeInfo,
    TradeSha: tradeSha,
  }
}

export function verifyAndDecryptNewebpayTrade(
    tradeInfo: string,
    tradeSha: string,
    hashKey: string,
    hashIv: string,
): unknown {
  // AES-CBC 密文必須是完整區塊的十六進位字串。
  if (
      !/^[0-9a-f]+$/i.test(tradeInfo) ||
      tradeInfo.length % 32 !== 0 ||
      tradeInfo.length > 65536 ||
      !/^[0-9a-f]{64}$/i.test(tradeSha)
  ) {
    throw new Error('Invalid payment payload')
  }

  const expectedSha = createHash('sha256')
      .update(
          `HashKey=${hashKey}&${tradeInfo}&HashIV=${hashIv}`,
          'utf8',
      )
      .digest()

  const receivedSha = Buffer.from(tradeSha, 'hex')

  // 先驗證簽章，通過後才解密。
  if (!timingSafeEqual(expectedSha, receivedSha)) {
    throw new Error('Invalid payment signature')
  }

  const decipher = createDecipheriv(
      'aes-256-cbc',
      Buffer.from(hashKey, 'utf8'),
      Buffer.from(hashIv, 'utf8'),
  )

// 自行驗證 padding，不使用 Node.js 的自動移除。
  decipher.setAutoPadding(false)

  const padded = Buffer.concat([
    decipher.update(Buffer.from(tradeInfo, 'hex')),
    decipher.final(),
  ])

  const paddingLength = padded[padded.length - 1]

// 相容 16-byte 與 32-byte 補齊方式。
// 每個尾端 byte 都必須等於 padding 長度。
  const paddingValid =
      paddingLength !== undefined &&
      paddingLength >= 1 &&
      paddingLength <= 32 &&
      paddingLength < padded.length &&
      (paddingLength <= 16 || padded.length % 32 === 0) &&
      padded
          .subarray(padded.length - paddingLength)
          .every(value => value === paddingLength)

  if (!paddingValid) {
    console.warn('藍新解密：padding 格式不符合預期')

    throw new Error('Invalid payment padding')
  }

  const decrypted = padded
      .subarray(0, padded.length - paddingLength)
      .toString('utf8')

  return JSON.parse(decrypted)
}