require('dotenv').config()
const axios = require('axios')
const HomieDevice = require('homie-device')
const { parse } = require('node-html-parser')

const login = async () => {
  try {
    console.log(process.env.LOGIN_REQUEST)
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
    return
  } catch (err) {
    const cookie = err.response.headers['set-cookie'][0].split(';')[0]

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

const processLoop = async (callback) => {
  try {
    const cookie = await login()
    console.log(cookie)
    const deviceStatusPage = parse(await getDeviceStatusPage(cookie))
    const temperature = deviceStatusPage.querySelector('.control-temp .big-number').text
    const [oxyCurr, oxyVolt] = deviceStatusPage.querySelectorAll('.oxy .big-number').map(x => x.text)
    const [ionCurr, ionVolt] = deviceStatusPage.querySelectorAll('.ion .big-number').map(x => x.text)
    const pH = deviceStatusPage.querySelector('.control-ph .big-number').text
    console.log(temperature, oxyCurr, oxyVolt, ionCurr, ionVolt, pH)
    callback({
      temperature,
      oxyCurr,
      oxyVolt,
      ionCurr,
      ionVolt,
      pH
    })
  } catch (err) {
    console.error(err)
  }
  await new Promise(res => setTimeout(res, 60000))
  process.nextTick(processLoop)
}


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

const publishCallback = (node, data) => {
  for (const [key, value] of Object.entries(data)) {
    node.setProperty(key).send(value)
  }
}

const main = async () => {
  const node = device.node(process.env.HOMIE_NODE, process.env.HOMIE_NODE, 'oxymatic-controller')
  node.advertise('temperature').setUnit('°C').setDatatype('string')
  node.advertise('oxyCurr').setDatatype('string')
  node.advertise('oxyVolt').setDatatype('string')
  node.advertise('ionCurr').setDatatype('string')
  node.advertise('ionVolt').setDatatype('string')
  node.advertise('pH').setDatatype('string')

  device.on('connect', () => {
    processLoop(data => { publishCallback(node, data) })
  })
  device.setup()

}

main().catch(console.error)