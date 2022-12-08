import React, { FunctionComponent } from "react";

import { Chart } from "@antv/g2";

export interface IMyComponentProps {
  counter: number;
  onClick?: () => void;
}

export const CustomReactComponent: FunctionComponent<IMyComponentProps> = (props: IMyComponentProps) => {

    const chart = new Chart({
        container: "container",
        autoFit: true,
    });
      
    chart
        .line()
        .data({
            type: "fetch",
            value:
            "https://gw.alipayobjects.com/os/bmw-prod/551d80c6-a6be-4f3c-a82a-abd739e12977.csv",
            transform: [
            // Mock missing data.
                {
                    type: "map",
                    callback: (d:any) => ({
                        ...d,
                        close: d.date.getUTCMonth() < 3 ? NaN : d.close,
                    }),
                },
            ],
        })
        .encode("x", "date")
        .encode("y", "close")
        .style("connectNulls", true)
        .style("connectStroke", "#aaa");
      
    chart.render();
      

    return (
        <div id="container">
        </div>
    );
};
