import type { FC } from "react"

const ChangelogPage: FC = () => {
  return (
    <div className="max-w-3xl mx-auto p-6 text-gray-800">
      <h1 className="text-3xl font-bold mb-4">What&apos;s New in Version 1.1</h1>
      <p className="mb-4">Released May 10, 2025</p>

      <p className="mb-4">
        We’ve made improvements to make it easier and faster to find vending
        machines near you.
      </p>

      <ul className="list-disc list-inside mb-4 space-y-2">
        <li>
          <strong>Faster Map Load</strong> – The map now opens more quickly and
          runs smoothly.
        </li>
        <li>
          <strong>Smart Grouping</strong> – Nearby machines are grouped together
          so the map stays clear.
        </li>
        <li>
          <strong>Precise Locations</strong> – Each machine pin is more accurate
          to its real-world spot.
        </li>
        <li>
          <strong>Up-to-Date Data</strong> – Machines that were added recently
          have been added to the map.
        </li>
        <li>
          <strong>Easy Zoom</strong> – Tap any group to zoom in and view each
          machine individually.
        </li>
        <li>
          <strong>Search Bar</strong> – Search for any address and find the closest
          vending machine within a 30-mile radius.
        </li>
        <li>
          <strong>UI Updates</strong> – Made the sidebar less intrusive.
        </li>
        <li>
          <strong>Discord Community</strong> – We now have a discord community for
          users to ask for support or request new features. Click support on the home page.
        </li>
      </ul>
    </div>
  )
}

export default ChangelogPage
