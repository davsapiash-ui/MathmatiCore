export const MOCK_RRWEB_EVENTS = [
  {
    type: 4,
    data: { href: "http://localhost:5173/workspace", width: 1024, height: 768 },
    timestamp: Date.now() - 5000,
  },
  {
    type: 2,
    data: {
      node: {
        type: 0,
        childNodes: [
          {
            type: 2,
            tagName: "html",
            attributes: {},
            childNodes: [
              { type: 2, tagName: "head", attributes: {}, childNodes: [] },
              {
                type: 2,
                tagName: "body",
                attributes: { style: "background-color: #f8fafc; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;" },
                childNodes: [
                  {
                    type: 2,
                    tagName: "div",
                    attributes: { style: "text-align: center;" },
                    childNodes: [
                      {
                        type: 2,
                        tagName: "h1",
                        attributes: { style: "color: #4f46e5; font-size: 2rem; margin-bottom: 1rem;" },
                        childNodes: [{ type: 3, textContent: "תלמיד עובד על פירוק עשרות..." }],
                      },
                      {
                        type: 2,
                        tagName: "div",
                        attributes: { style: "display: flex; gap: 10px; justify-content: center;" },
                        childNodes: [
                          { type: 2, tagName: "div", attributes: { style: "width: 20px; height: 20px; background: #3b82f6; border-radius: 4px;" }, childNodes: [] },
                          { type: 2, tagName: "div", attributes: { style: "width: 20px; height: 20px; background: #3b82f6; border-radius: 4px;" }, childNodes: [] },
                          { type: 2, tagName: "div", attributes: { style: "width: 20px; height: 20px; background: #3b82f6; border-radius: 4px;" }, childNodes: [] }
                        ]
                      }
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      initialOffset: { left: 0, top: 0 },
    },
    timestamp: Date.now() - 5000,
  },
];
