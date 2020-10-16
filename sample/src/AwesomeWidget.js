import React from "react";
import i18n from "shared/i18n";

export default class AwesomeWidget extends React.Component {
  constructor(props) {
    super(props);

    this.handleClick = this.handleClick.bind(this);
  }

  handleClick() {
    //
  }

  render() {
    return (
      <div className="awesome_design_system_flex">
        <h2>{i18n.t("awesome_widget.header")}</h2>
        <button onClick={this.handleClick}></button>
      </div>
    );
  }
}
