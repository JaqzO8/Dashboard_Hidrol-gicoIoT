import * as echarts from "echarts/core";
import { LineChart, BarChart, CustomChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
echarts.use([LineChart, BarChart, CustomChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);
export { echarts };
