import { useEffect, useState } from "react"

import "./style.css"

function IndexPopup() {
  const [data, setData] = useState("")

  const [offset, setOffset] = useState(0)

  useEffect(() => {
    const onScroll = () => setOffset(window.pageYOffset)
    // clean up code
    window.removeEventListener("scroll", onScroll)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  console.log(offset)

  return (
    <div
      style={{
        width: "320px",
        display: "flex",
        flexDirection: "column",
        padding: 16
      }}
      className="dm-bg-red-200">
      <h2 className="dm-text-lg dm-font-mono">
        TESTING AGAINNNN
        <a href="https://www.plasmo.com" target="_blank">
          Plasmo
        </a>{" "}
        Extension!
      </h2>
      {data}
      <input onChange={(e) => setData(e.target.value)} value={data} />
      <a href="https://docs.plasmo.com" target="_blank">
        View Docs
      </a>
    </div>
  )
}

export default IndexPopup
