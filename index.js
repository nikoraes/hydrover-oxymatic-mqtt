require('dotenv').config()
const axios = require('axios')
const HomieDevice = require('homie-device')
const { parse } = require('node-html-parser')

const homieConfig = {
  name: process.env.HOMIE_NAME,
  device_id: process.env.HOMIE_DEVICE_ID,
  mqtt: {
    host: process.env.MQTT_HOST,
    port: process.env.MQTT_PORT,
    auth: true,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    base_topic: `${process.env.MQTT_BASE_TOPIC}/`
  }
}
const device = new HomieDevice(homieConfig)

const login = async () => {
  try {
    await axios({
      method: 'POST',
      url: 'https://oxymaticapp.hydrover.eu/home/login',
      data: process.env.LOGIN_REQUEST,
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      maxRedirects: 0
    })
    // This should fail because it's redirected, if it doesn't fail, return undefined
    throw new Error('Login failed')
  } catch (err) {
    const cookie = err.response && err.response.headers['set-cookie'][0].split(';')[0]
    if (!cookie) console.error('Login failed', err)

    const resp = await axios({
      method: 'GET',
      url: 'https://oxymaticapp.hydrover.eu/Users/Account',
      headers: {
        cookie
      }
    })

    const requestVerificationTokenCookie = resp.headers['set-cookie'][0].split(';')[0]

    // TODO: scrape device ids

    return `${cookie}; ${requestVerificationTokenCookie}`

  }
}

const getDeviceStatusPage = async (cookie) => {
  const resp = await axios({
    method: 'GET',
    url: 'https://oxymaticapp.hydrover.eu/devices/DeviceStatus?id=2723',
    headers: {
      cookie
    }
  })
  return resp.data
}

const setDeviceMode = async (mode, cookie) => {
  const resp = await axios({
    method: 'GET',
    url: `https://oxymaticapp.hydrover.eu/devices/${mode}?id=2723`,
    headers: {
      cookie
    }
  })
  return resp.data
}

const processLoop = async (callback) => {
  try {
    const cookie = await login()
    const deviceStatusRaw = await getDeviceStatusPage(cookie)
    const deviceStatusPage = parse(deviceStatusRaw)
    const temperature = deviceStatusPage.querySelector('.control-temp .big-number').text
    const [oxyCurr, oxyVolt] = deviceStatusPage.querySelectorAll('.oxy .big-number').map(x => x.text)
    const [ionCurr, ionVolt] = deviceStatusPage.querySelectorAll('.ion .big-number').map(x => x.text)
    const pH = deviceStatusPage.querySelector('.control-ph .big-number').text
    const redox = deviceStatusPage.querySelector('.control-redox .big-number').text
    const mode = deviceStatusPage.querySelectorAll('.statusresume p').find(x => x.text.includes('MODE')) &&
      deviceStatusPage.querySelectorAll('.statusresume p').find(x => x.text.includes('MODE')).text.replace('MODE: ', '').toLowerCase().includes('auto') ? 'auto' : 'off'
    const prog = deviceStatusPage.querySelectorAll('.statusresume p').find(x => x.text.includes('PROG')) &&
      deviceStatusPage.querySelectorAll('.statusresume p').find(x => x.text.includes('PROG')).text.replace('PROG: ', '').trim()

    callback({
      temperature,
      oxyCurr,
      oxyVolt,
      ionCurr,
      ionVolt,
      pH,
      redox,
      mode,
      prog
    })
  } catch (err) {
    console.error(err)
  }
  await new Promise(res => setTimeout(res, 300000))
  process.nextTick(() => processLoop(callback))
}

const publishCallback = (node, data) => {
  for (const [key, value] of Object.entries(data)) {
    if (!value) continue
    node.setProperty(key).send(value.replace(',', '.'))
  }
}

const main = async () => {
  const node = device.node(process.env.HOMIE_NODE, process.env.HOMIE_NODE, 'oxymatic-controller')
  node.advertise('temperature').setName('Temperature').setUnit('°C').setDatatype('float')
  node.advertise('oxyCurr').setName('OXY Current').setDatatype('float')
  node.advertise('oxyVolt').setName('OXY Voltage').setDatatype('float')
  node.advertise('ionCurr').setName('ION Current').setDatatype('float')
  node.advertise('ionVolt').setName('ION Voltage').setDatatype('float')
  node.advertise('pH').setDatatype('float')
  node.advertise('redox').setName('Redox').setDatatype('float')
  node.advertise('mode').setName('Mode').setDatatype('enum').setFormat('auto,off').settable(async (range, value) => {
    const cookie = await login()
    node.setProperty('mode').send(value)
  })
  node.advertise('prog').setName('Program').setDatatype('string')

  device.on('connect', () => {
    processLoop(data => { publishCallback(node, data) })
  })

  device.setup()
}

main().catch(console.error)