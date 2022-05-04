require('dotenv').config()
const axios = require('axios')
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

const processLoop = async () => {
  try {
    const cookie = await login()
    console.log(cookie)
    const deviceStatusPage = parse(await getDeviceStatusPage(cookie))
    const temperature = deviceStatusPage.querySelector('.control-temp .big-number').text
    const [oxyCurr, oxyVolt] = deviceStatusPage.querySelectorAll('.oxy .big-number').map(x => x.text)
    const [ionCurr, ionVolt] = deviceStatusPage.querySelectorAll('.ion .big-number').map(x => x.text)
    const pH = deviceStatusPage.querySelector('.control-ph .big-number').text
    console.log(temperature, oxyCurr, oxyVolt, ionCurr, ionVolt, pH)
  } catch (err) {
    console.error(err)
  }
  await new Promise(res => setTimeout(res, 60000))
  process.nextTick(processLoop)
}

const main = async () => {
  await processLoop()
}

main().catch(console.error)